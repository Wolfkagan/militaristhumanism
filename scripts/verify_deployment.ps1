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
        [ValidateSet("GET", "HEAD")][string]$Method = "GET",
        [bool]$AllowRedirect = $false
    )

    $request = [Net.HttpWebRequest]::Create($Uri)
    $request.Method = $Method
    $request.AllowAutoRedirect = $AllowRedirect
    $request.UserAgent = "MilitaristHumanism-DeploymentVerifier/0.1"
    $request.Timeout = 20000
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
