[CmdletBinding()]
param(
    [string]$BaseUrl = "https://militaristhumanism.com",
    [string]$PagesDevUrl = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$script:Failures = New-Object System.Collections.Generic.List[string]
$script:Evidence = New-Object System.Collections.Generic.List[string]

function Get-Response {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [ValidateSet("GET", "HEAD", "OPTIONS")][string]$Method = "GET",
        [bool]$AllowRedirect = $false,
        [hashtable]$Headers = @{}
    )

    $request = [Net.HttpWebRequest]::Create($Uri)
    $request.Method = $Method
    $request.AllowAutoRedirect = $AllowRedirect
    $request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
    $request.Timeout = 20000
    foreach ($name in $Headers.Keys) {
        $request.Headers[$name] = $Headers[$name]
    }
    try {
        return [Net.HttpWebResponse]$request.GetResponse()
    }
    catch [Net.WebException] {
        if ($null -ne $_.Exception.Response) {
            return [Net.HttpWebResponse]$_.Exception.Response
        }
        throw
    }
}

function Assert-Equal {
    param([string]$Name, $Actual, $Expected)
    if ($Actual -ne $Expected) {
        $script:Failures.Add("$Name expected '$Expected' but received '$Actual'")
    }
    else {
        $script:Evidence.Add("$Name=$Actual")
    }
}

function Assert-Contains {
    param([string]$Name, [string]$Actual, [string]$Expected)
    if ([string]::IsNullOrEmpty($Actual) -or -not $Actual.Contains($Expected)) {
        $script:Failures.Add("$Name does not contain '$Expected'")
    }
    else {
        $script:Evidence.Add("$Name=PASS")
    }
}

function Assert-NotContains {
    param([string]$Name, [string]$Actual, [string]$Forbidden)
    if (-not [string]::IsNullOrEmpty($Actual) -and $Actual.Contains($Forbidden)) {
        $script:Failures.Add("$Name contains forbidden value '$Forbidden'")
    }
    else {
        $script:Evidence.Add("$Name=PASS")
    }
}

function Assert-Matches {
    param([string]$Name, [string]$Actual, [string]$Pattern)
    if ([string]::IsNullOrEmpty($Actual) -or -not [regex]::IsMatch($Actual, $Pattern)) {
        $script:Failures.Add("$Name does not match the required pattern")
    }
    else {
        $script:Evidence.Add("$Name=PASS")
    }
}

function Read-Body {
    param([Net.HttpWebResponse]$Response)
    $reader = New-Object IO.StreamReader($Response.GetResponseStream())
    try { return $reader.ReadToEnd() }
    finally { $reader.Dispose() }
}

$canonical = "https://militaristhumanism.com/"

try {
    $homeResponse = Get-Response -Uri "$BaseUrl/" -Method GET
    Assert-Equal "APEX_STATUS" ([int]$homeResponse.StatusCode) 200
    $html = Read-Body -Response $homeResponse

    $requiredHeaders = @(
        "Content-Security-Policy",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Cross-Origin-Opener-Policy",
        "Cross-Origin-Resource-Policy",
        "Cache-Control"
    )
    foreach ($header in $requiredHeaders) {
        if ([string]::IsNullOrWhiteSpace($homeResponse.Headers[$header])) {
            $script:Failures.Add("Missing production header: $header")
        }
        else {
            $script:Evidence.Add("HEADER_$($header.ToUpperInvariant())=PASS")
        }
    }
    $homeCsp = $homeResponse.Headers["Content-Security-Policy"]
    Assert-Matches "CSP_NONCE" $homeCsp "script-src[^;]*'nonce-[A-Za-z0-9_-]{24}'"
    Assert-Contains "CSP_ANALYTICS_CONNECT" $homeCsp "connect-src 'self' https://cloudflareinsights.com"
    Assert-NotContains "CSP_NO_UNSAFE_INLINE" $homeCsp "unsafe-inline"
    Assert-NotContains "CSP_NO_UNSAFE_EVAL" $homeCsp "unsafe-eval"
    $nonceMatch = [regex]::Match($homeCsp, "'nonce-([A-Za-z0-9_-]{24})'")
    $homeNonce = if ($nonceMatch.Success) { $nonceMatch.Groups[1].Value } else { "" }

    $inlineScripts = [regex]::Matches(
        $html,
        "<script(?<attributes>[^>]*)>(?<body>[\s\S]*?)</script>",
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    ) | Where-Object { $_.Groups["attributes"].Value -notmatch "\bsrc\s*=" }
    if ($inlineScripts.Count -eq 0) {
        $script:Failures.Add("Cloudflare JavaScript Detections inline bootstrap was not observed")
    }
    else {
        $script:Evidence.Add("JSD_INLINE_BOOTSTRAP=OBSERVED")
    }
    $nonceAttributePattern = '\bnonce\s*=\s*["' + [char]39 + ']' + [regex]::Escape($homeNonce) + '["' + [char]39 + ']'
    foreach ($inlineScript in $inlineScripts) {
        $attributes = $inlineScript.Groups["attributes"].Value
        if ([string]::IsNullOrEmpty($homeNonce) -or $attributes -notmatch $nonceAttributePattern) {
            $script:Failures.Add("An inline production script does not carry the response CSP nonce")
            break
        }
    }
    if ($inlineScripts.Count -gt 0 -and $script:Failures -notcontains "An inline production script does not carry the response CSP nonce") {
        $script:Evidence.Add("JSD_NONCE_ALIGNMENT=PASS")
    }
    Assert-Contains "WEB_ANALYTICS_BEACON" $html "https://static.cloudflareinsights.com/beacon.min.js"
    Assert-Contains "PUBLIC_CACHE_POLICY" $homeResponse.Headers["Cache-Control"] "public"
    Assert-Contains "COOKIE_CACHE_VARIANCE" $homeResponse.Headers["Vary"] "Cookie"
    Assert-Contains "CANONICAL_HTML" $html "<link rel=`"canonical`" href=`"$canonical`">"
    Assert-Contains "TITLE_HTML" $html "The Canonical Philosophy"
    Assert-Contains "CANONICAL_DOCTRINE_HTML" $html "Humanity is the end."
    Assert-Contains "DESCRIPTION_HTML" $html "The canonical philosophy that makes human dignity the end"
    Assert-Contains "OG_URL_HTML" $html "<meta property=`"og:url`" content=`"$canonical`">"
    Assert-Contains "OG_IMAGE_HTML" $html "https://militaristhumanism.com/assets/og-image.png"
    $loopbackName = "local" + "host"
    $draftDomain = "example" + ".com"
    Assert-NotContains "NO_LOCAL_HOST_HTML" $html $loopbackName
    Assert-NotContains "NO_DRAFT_DOMAIN_HTML" $html $draftDomain
    Assert-NotContains "NO_INSECURE_REFERENCE_HTML" $html "http://"
    $homeResponse.Dispose()

    $communityResponse = Get-Response -Uri "$BaseUrl/community" -Method GET
    Assert-Equal "COMMUNITY_STATUS" ([int]$communityResponse.StatusCode) 200
    $communityHtml = Read-Body -Response $communityResponse
    $communityCsp = $communityResponse.Headers["Content-Security-Policy"]
    $communityNonceMatch = [regex]::Match($communityCsp, "'nonce-([A-Za-z0-9_-]{24})'")
    if (-not $communityNonceMatch.Success) {
        $script:Failures.Add("COMMUNITY_CSP_NONCE is missing")
    }
    else {
        $communityNonce = $communityNonceMatch.Groups[1].Value
        $script:Evidence.Add("COMMUNITY_CSP_NONCE=PASS")
        if ($communityNonce -eq $homeNonce) {
            $script:Failures.Add("CSP nonce was reused across two responses")
        }
        else {
            $script:Evidence.Add("CSP_NONCE_UNIQUENESS=PASS")
        }
        Assert-Contains "COMMUNITY_SCRIPT_NONCE" $communityHtml "nonce=`"$communityNonce`""
    }
    $communityResponse.Dispose()

    $healthResponse = Get-Response -Uri "$BaseUrl/api/health" -Method GET
    Assert-Equal "HEALTH_STATUS" ([int]$healthResponse.StatusCode) 200
    $healthBody = Read-Body -Response $healthResponse
    Assert-Equal "HEALTH_BODY" $healthBody '{"status":"ok"}'
    $healthResponse.Dispose()

    $adminResponse = Get-Response -Uri "$BaseUrl/admin/overview" -Method GET
    Assert-Equal "ANONYMOUS_ADMIN_STATUS" ([int]$adminResponse.StatusCode) 401
    Assert-Contains "ANONYMOUS_ADMIN_CACHE_PRIVATE" $adminResponse.Headers["Cache-Control"] "private"
    Assert-Contains "ANONYMOUS_ADMIN_CACHE_NO_STORE" $adminResponse.Headers["Cache-Control"] "no-store"
    $adminResponse.Dispose()

    $preflightResponse = Get-Response -Uri "$BaseUrl/api/community/threads" -Method OPTIONS -Headers @{
        "Origin" = "https://malicious.invalid"
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "content-type,x-csrf-token"
    }
    if (-not [string]::IsNullOrWhiteSpace($preflightResponse.Headers["Access-Control-Allow-Origin"])) {
        $script:Failures.Add("MALICIOUS_PREFLIGHT exposed Access-Control-Allow-Origin")
    }
    else {
        $script:Evidence.Add("MALICIOUS_PREFLIGHT_NO_ACAO=PASS")
    }
    $preflightResponse.Dispose()

    $resourceChecks = @{
        "ROBOTS_STATUS" = "$BaseUrl/robots.txt"
        "SITEMAP_STATUS" = "$BaseUrl/sitemap.xml"
        "FAVICON_STATUS" = "$BaseUrl/favicon.svg"
        "MANIFEST_STATUS" = "$BaseUrl/site.webmanifest"
        "TURKISH_STATUS" = "$BaseUrl/tr/"
        "GERMAN_STATUS" = "$BaseUrl/de/"
    }
    foreach ($name in $resourceChecks.Keys) {
        $response = Get-Response -Uri $resourceChecks[$name] -Method GET
        Assert-Equal $name ([int]$response.StatusCode) 200
        $response.Dispose()
    }

    $notFound = Get-Response -Uri "$BaseUrl/nonexistent-path-v01-verification" -Method GET
    Assert-Equal "NOT_FOUND_STATUS" ([int]$notFound.StatusCode) 404
    $notFoundHtml = Read-Body -Response $notFound
    Assert-Contains "NOT_FOUND_BODY" $notFoundHtml "The requested page was not found."
    $notFound.Dispose()

    $turkish = Get-Response -Uri "$BaseUrl/tr/" -Method GET
    $turkishHtml = Read-Body -Response $turkish
    Assert-Contains "TURKISH_TITLE_HTML" $turkishHtml "Kanonik Felsefe"
    Assert-Contains "TURKISH_DOCTRINE_HTML" $turkishHtml "On temel yasa"
    Assert-Contains "TURKISH_CANONICAL_HTML" $turkishHtml "<link rel=`"canonical`" href=`"https://militaristhumanism.com/tr/`">"
    $turkish.Dispose()

    $german = Get-Response -Uri "$BaseUrl/de/" -Method GET
    $germanHtml = Read-Body -Response $german
    Assert-Contains "GERMAN_TITLE_HTML" $germanHtml "Die kanonische Philosophie"
    Assert-Contains "GERMAN_DOCTRINE_HTML" $germanHtml "Humanismus ist das Ziel"
    Assert-Contains "GERMAN_CANONICAL_HTML" $germanHtml "<link rel=`"canonical`" href=`"https://militaristhumanism.com/de/`">"
    $german.Dispose()

    $httpApex = Get-Response -Uri "http://militaristhumanism.com/" -Method HEAD
    Assert-Equal "HTTP_APEX_STATUS" ([int]$httpApex.StatusCode) 301
    Assert-Equal "HTTP_APEX_LOCATION" $httpApex.Headers["Location"] $canonical
    $httpApex.Dispose()

    $wwwRoot = Get-Response -Uri "https://www.militaristhumanism.com/" -Method HEAD
    Assert-Equal "WWW_STATUS" ([int]$wwwRoot.StatusCode) 301
    Assert-Equal "WWW_LOCATION" $wwwRoot.Headers["Location"] $canonical
    $wwwRoot.Dispose()

    $wwwPath = Get-Response -Uri "https://www.militaristhumanism.com/test?source=verify" -Method HEAD
    Assert-Equal "WWW_PATH_STATUS" ([int]$wwwPath.StatusCode) 301
    Assert-Equal "WWW_PATH_QUERY_LOCATION" $wwwPath.Headers["Location"] "https://militaristhumanism.com/test?source=verify"
    $wwwPath.Dispose()

    if (-not [string]::IsNullOrWhiteSpace($PagesDevUrl)) {
        $pagesBase = $PagesDevUrl.TrimEnd("/")
        $pages = Get-Response -Uri "$pagesBase/" -Method HEAD
        Assert-Equal "PAGES_DEV_STATUS" ([int]$pages.StatusCode) 301
        Assert-Equal "PAGES_DEV_LOCATION" $pages.Headers["Location"] $canonical
        $pages.Dispose()

        $pagesPath = Get-Response -Uri "$pagesBase/test?source=verify" -Method HEAD
        Assert-Equal "PAGES_DEV_PATH_STATUS" ([int]$pagesPath.StatusCode) 301
        Assert-Equal "PAGES_DEV_PATH_QUERY_LOCATION" $pagesPath.Headers["Location"] "https://militaristhumanism.com/test?source=verify"
        $pagesPath.Dispose()
    }
    else {
        $script:Failures.Add("PagesDevUrl is required for the production release verification")
    }
}
catch {
    $script:Failures.Add("Verifier exception: $($_.Exception.Message)")
}

if ($script:Failures.Count -eq 0) {
    Write-Output "FINAL_RESULT=PASS"
}
else {
    Write-Output "FINAL_RESULT=FAIL"
}
Write-Output "EVIDENCE SUMMARY"
foreach ($item in $script:Evidence) { Write-Output "- $item" }
foreach ($failure in $script:Failures) { Write-Output "- FAIL: $failure" }

if ($script:Failures.Count -gt 0) { exit 1 }
exit 0
