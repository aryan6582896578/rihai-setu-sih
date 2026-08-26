param(
    [string]$ApiBase = "http://localhost:4000"
)

# RIHAI SETU smoke test v5 -- Prompt 11: family notifications across the lifecycle.
# Walks one application through drafted -> filed -> hearing -> granted(bond) ->
# surety arranged -> released via HTTP, then hands the appId to
# apps/api/scripts/prompt11-probe.ts which asserts every templated family message
# landed in NotificationLog (plus engine edge cases: consent gate, dedupe,
# denial-lawyer gating, Hindi render).

$script:passCount = 0
$script:failCount = 0
$script:failures = New-Object System.Collections.Generic.List[string]

function Test-Result {
    param([string]$Name, [bool]$Condition, [string]$Detail = "")
    if ($Condition) {
        $script:passCount++
        Write-Output ("PASS  {0}" -f $Name)
    } else {
        $script:failCount++
        $line = "FAIL  {0}  {1}" -f $Name, $Detail
        $script:failures.Add($line)
        Write-Output $line
    }
}

function Invoke-Api {
    param([string]$Method, [string]$Url, $Body, [hashtable]$Headers)
    try {
        $params = @{ Method = $Method; Uri = $Url; ErrorAction = "Stop"; TimeoutSec = 25 }
        if ($Body -ne $null) {
            $params.Body = ($Body | ConvertTo-Json -Depth 6)
            $params.ContentType = "application/json"
        }
        if ($Headers) { $params.Headers = $Headers }
        try {
            $resp = Invoke-WebRequest @params -UseBasicParsing
        } catch {
            if ($_.Exception.Response -eq $null) {
                Start-Sleep -Milliseconds 800
                $resp = Invoke-WebRequest @params -UseBasicParsing
            } else { throw }
        }
        $data = $null
        if ($resp.Content) {
            try { $data = $resp.Content | ConvertFrom-Json } catch { $data = $resp.Content }
        }
        return @{ Status = [int]$resp.StatusCode; Data = $data }
    } catch {
        $code = -1
        try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
        return @{ Status = $code; Error = $_.ErrorDetails.Message }
    }
}

function Invoke-Login {
    param([string]$Email, [string]$Password)
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        try {
            $raw = Invoke-WebRequest -Uri "$($script:ApiBase)/api/v1/auth/login" `
                -Method Post -ContentType "application/json" `
                -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
                -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
            return @{ Status = 200; Body = ($raw.Content | ConvertFrom-Json) }
        } catch {
            $code = -1
            try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
            if ($code -eq 429 -and $attempt -eq 0) {
                Write-Output "      (rate-limited by design -- waiting 65s)"
                Start-Sleep -Seconds 65
                continue
            }
            return @{ Status = $code; Body = $null }
        }
    }
    return @{ Status = -1; Body = $null }
}

Write-Output "=== RIHAI SETU smoke test v5 -- prompt 11: family notifications ==="

$loginSuper = Invoke-Login -Email "superintendent1@rihai.gov.in" -Password "Passw0rd!23"
$hdr = @{ Authorization = "Bearer $($loginSuper.Body.accessToken)" }
Test-Result "Staff login" ($loginSuper.Status -eq 200) ("status=" + $loginSuper.Status)

$jails = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?pageSize=5" -Headers $hdr
$jailId = $jails.Data.data[0].id

# ---------- intake captures consent alongside the NOK contact ----------
$runTag = -join ((97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
$create = Invoke-Api -Method Post -Url "$ApiBase/api/v1/jails/$jailId/prisoners" -Headers $hdr -Body @{
    fullName = "P11 Chain $runTag"
    dateOfBirth = "1995-05-10"
    gender = "male"
    nextOfKinName = "Kin of $runTag"
    nextOfKinPhone = "+9198760000111"
    nextOfKinConsentGiven = $true
    nextOfKinPreferredChannel = "sms"
    nextOfKinPreferredLocale = "en"
    case = @{
        caseNumber = "CASE/P11-$runTag"
        courtName = "District Court (P11)"
        offence = "IPC 304 - Prompt 11 chain"
        maxSentenceYears = 3
        carriesDeathOrLife = $false
        isFirstTimeOffender = $true
        pendingCaseCount = 1
        custodyStartDate = (Get-Date).AddDays(-365 * 3).ToString("yyyy-MM-dd")
    }
}
$prisonerId = $create.Data.data.id
Test-Result "Intake records NOK contact + consent" (
    $create.Status -eq 201 -and $prisonerId
) ("status=" + $create.Status)

$nokGet = Invoke-Api -Method Get -Url "$ApiBase/api/v1/prisoners/$prisonerId/next-of-kin" -Headers $hdr
Test-Result "GET next-of-kin returns decrypted contact + prefs" (
    $nokGet.Status -eq 200 -and $nokGet.Data.data.consentGiven -eq $true -and $nokGet.Data.data.nextOfKinPhone -eq "+9198760000111"
) ("status=" + $nokGet.Status)

$app = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$prisonerId/applications" -Headers $hdr -Body @{ type = "bail" }
$appId = $app.Data.data.id
Test-Result "Application opened (flagged)" ($app.Status -eq 201 -and $appId) ("status=" + $app.Status)

# ---------- walk the lifecycle ----------
$s1 = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/stage" -Headers $hdr -Body @{ stage = "drafted" }
Test-Result "Advance flagged -> drafted" ($s1.Status -eq 200) ("status=" + $s1.Status)

$rev = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$appId/review" -Headers $hdr
Test-Result "Mark reviewed by superintendent" ($rev.Status -eq 200) ("status=" + $rev.Status)

$s2 = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/stage" -Headers $hdr -Body @{ stage = "filed" }
Test-Result "Advance drafted -> filed (post-review)" ($s2.Status -eq 200) ("status=" + $s2.Status)

# Pre-set bond amount so the granted message is actionable.
$suretyPre = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/surety-status" -Headers $hdr -Body @{
    suretyRequired = $true
    bondAmount = 25000
}
Test-Result "Surety checklist opened with bond amount" ($suretyPre.Status -eq 200) ("status=" + $suretyPre.Status)

# Mock court clock: ~0.7s to hearing window, ~1.8s to outcome. Drive syncs and
# observe the application state itself (robust against sync 409s after the
# outcome lands and the stage leaves the sync window).
$outcome = $null
for ($i = 0; $i -lt 20 -and $outcome -eq $null; $i++) {
    Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$appId/sync-court-status" -Headers $hdr | Out-Null
    Start-Sleep -Milliseconds 500
    $appState = Invoke-Api -Method Get -Url "$ApiBase/api/v1/applications/$appId" -Headers $hdr
    if ($appState.Data.data.orderOutcome) { $outcome = $appState.Data.data.orderOutcome }
}
Test-Result "Court sync reaches an order outcome (mock clock)" ($outcome -eq "granted") ("outcome=" + $outcome)

$suretyArr = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/surety-status" -Headers $hdr -Body @{ suretyArranged = $true }
Test-Result "Surety arranged flips checklist" ($suretyArr.Status -eq 200 -and $suretyArr.Data.data.suretyArranged) ("status=" + $suretyArr.Status)

$rel = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/stage" -Headers $hdr -Body @{ stage = "released" }
Test-Result "Release completes after granted + surety" ($rel.Status -eq 200 -and $rel.Data.data.stage -eq "released") ("status=" + $rel.Status)

# ---------- consent toggle stops sends immediately ----------
$consentOff = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/prisoners/$prisonerId/next-of-kin" -Headers $hdr -Body @{ consentGiven = $false }
Test-Result "Consent toggled off" ($consentOff.Status -eq 200 -and $consentOff.Data.data.consentGiven -eq $false) ""

$app2 = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$prisonerId/applications" -Headers $hdr -Body @{ type = "personal_bond" }
$appId2 = $app2.Data.data.id
$s3 = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId2/stage" -Headers $hdr -Body @{ stage = "drafted" }
Test-Result "Second application advances with consent OFF" ($s3.Status -eq 200) ("status=" + $s3.Status)

# ---------- templates admin API (super_admin ONLY) ----------
$adminLogin = Invoke-Login -Email "superadmin@rihai.gov.in" -Password "Passw0rd!23"
$adminHdr = @{ Authorization = "Bearer $($adminLogin.Body.accessToken)" }

$tList = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/notification-templates?locale=hi" -Headers $adminHdr
$hiRows = @($tList.Data.data)
Test-Result "Template list filtered by locale (16 hi rows)" ($tList.Status -eq 200 -and $hiRows.Count -eq 16) ("status=" + $tList.Status + " count=" + $hiRows.Count)

$staffLogin = Invoke-Login -Email "staff1a@rihai.gov.in" -Password "Passw0rd!23"
$staffBlocked = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/notification-templates" -Headers @{ Authorization = "Bearer $($staffLogin.Body.accessToken)" }
Test-Result "jail_staff blocked from template admin (403)" ($staffBlocked.Status -eq 403) ("status=" + $staffBlocked.Status)

if ($hiRows.Count -gt 0) {
    $tEdit = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/admin/notification-templates" -Headers $adminHdr -Body @{
        id = $hiRows[0].id
        messageTemplate = $hiRows[0].messageTemplate
    }
    Test-Result "super_admin can PATCH template copy" ($tEdit.Status -eq 200) ("status=" + $tEdit.Status)
} else {
    Test-Result "super_admin can PATCH template copy" $false "no rows to patch"
}

# ---------- hand off to the DB-level probe ----------
$env:P11_APP_ID = $appId
$env:P11_APP_ID2 = $appId2
Write-Output ""
Write-Output "--- probe: NotificationLog assertions + engine edges ---"
npx tsx apps/api/scripts/prompt11-probe.ts 2>&1 | Tee-Object -Variable probeOut
$probeExit = $LASTEXITCODE
if ($probeExit -ne 0) {
    $script:failCount++
    Write-Output "FAIL  probe suite exited $probeExit"
} else {
    $script:passCount++
    Write-Output "PASS  probe suite (lifecycle logs + engine edges)"
}

Write-Output ""
Write-Output ("RESULT: {0} passed, {1} failed" -f ($script:passCount + ($probeOut | Select-String -Pattern "^PASS" -AllMatches).Matches.Count), $script:failCount)
if ($script:failCount -gt 0) {
    foreach ($f in $script:failures) { Write-Output ("  " + $f) }
    exit 1
}
exit 0
