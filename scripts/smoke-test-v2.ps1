param(
    [string]$ApiBase = "http://localhost:4000"
)

$script:passCount = 0
$script:failCount = 0
$script:failures = New-Object System.Collections.Generic.List[string]
$script:ApiBase = $ApiBase

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

Write-Output "=== RIHAI SETU smoke test -- Prompts 2+3 ==="

$loginSuper = Invoke-Login -Email "superintendent1@rihai.gov.in" -Password "Passw0rd!23"
$superHdr = @{ Authorization = "Bearer $($loginSuper.Body.accessToken)" }
Test-Result "Superintendent login" ($loginSuper.Status -eq 200) ("status=" + $loginSuper.Status)

$jails = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?pageSize=10" -Headers $superHdr
$rampurId = $jails.Data.data[0].id
Test-Result "Jail resolved from dataset prisons" ([bool]$rampurId) ""

# ---------- prisoners list ----------
$list = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?page=1&pageSize=50" -Headers $superHdr
Test-Result "Prisoners list returns rows" ($list.Status -eq 200 -and $list.Data.total -gt 0) ("total=" + $list.Data.total)

$row0 = $list.Data.data | Select-Object -First 1
Test-Result "List rows carry computed custody label + eligibility badge" (
    $row0.custodyDurationLabel -and $row0.eligibility.status
) ""

$filtered = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?eligibility=eligible&pageSize=100" -Headers $superHdr
$allEligible = @($filtered.Data.data) | Where-Object { $_.eligibility.status -ne "eligible" }
Test-Result "Eligibility filter works" ($filtered.Status -eq 200 -and $allEligible.Count -eq 0) ("leaked=" + $allEligible.Count)

$searched = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?search=a" -Headers $superHdr
Test-Result "Free-text search returns matches" ($searched.Status -eq 200 -and $searched.Data.total -ge 1) ("total=" + $searched.Data.total)

# ---------- create prisoner ----------
$custodyToday = (Get-Date).ToString("yyyy-MM-dd")
$dob = "1998-05-14"
$create = Invoke-Api -Method Post -Url "$ApiBase/api/v1/jails/$rampurId/prisoners" -Headers $superHdr -Body @{
    fullName = "Smoke Admit Test"
    gender = "male"
    dateOfBirth = $dob
    case = @{
        caseNumber = "ST/CASE/SMOKE/001"
        courtName = "ACJM Court No. 2"
        offence = "Cheating (IPC 420)"
        maxSentenceYears = 3
        carriesDeathOrLife = $false
        isFirstTimeOffender = $true
        pendingCaseCount = 0
        custodyStartDate = $custodyToday
    }
}
Test-Result "Create prisoner -> 201 with detail" ($create.Status -eq 201 -and $create.Data.data.id) ("status=" + $create.Status)
$newPid = $create.Data.data.id
$newCaseId = $create.Data.data.primaryCaseId
Test-Result "Admission triggers first eligibility computation" (
    $create.Data.data.eligibility -and $create.Data.data.eligibility.reason -match "statutory threshold"
) ("status=" + $create.Data.data.eligibility.status)

# ---------- case edit flips eligibility ----------
$pastCustody = (Get-Date).AddDays(-400).ToString("yyyy-MM-dd")
$caseEdit = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/prisoners/$newPid/case/$newCaseId" -Headers $superHdr -Body @{
    custodyStartDate = $pastCustody
}
Test-Result "Case edit recomputes: now eligible at one-third" (
    $caseEdit.Status -eq 200 -and $caseEdit.Data.data.assessment.status -eq "eligible"
) ("status=" + $caseEdit.Data.data.assessment.status)

# ---------- recompute endpoint ----------
$recompute = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$newPid/eligibility/recompute" -Headers $superHdr
Test-Result "Manual recompute returns latest assessment" (
    $recompute.Status -eq 200 -and $recompute.Data.data.status -eq "eligible"
) ("status=" + $recompute.Data.data.status)

# ---------- superintendent portal ----------
$sessStaff = Invoke-Login -Email "staff1a@rihai.gov.in" -Password "Passw0rd!23"
$staffHdr = @{ Authorization = "Bearer $($sessStaff.Body.accessToken)" }
$staffBlocked = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/superintendent/eligible-prisoners" -Headers $staffHdr
Test-Result "jail_staff blocked from superintendent portal (403)" ($staffBlocked.Status -eq 403) ("status=" + $staffBlocked.Status)

$eligible = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/superintendent/eligible-prisoners" -Headers $superHdr
$found = @($eligible.Data.data) | Where-Object { $_.prisonerId -eq $newPid }
Test-Result "Eligible list includes newly eligible prisoner" ($eligible.Status -eq 200 -and $found) ("rows=" + @($eligible.Data.data).Count)

# ---------- auto-draft ----------
$autoDraft = Invoke-Api -Method Post -Url "$ApiBase/api/v1/jails/$rampurId/superintendent/auto-draft" -Headers $superHdr -Body @{
    prisonerIds = @($newPid)
    type = "bail"
}
$outcome = $autoDraft.Data.data[0]
Test-Result "Auto-draft succeeds with document URL" (
    $autoDraft.Status -eq 200 -and $outcome.ok -and $outcome.documentUrl
) ("ok=" + $outcome.ok + " err=" + $outcome.error)

$appId = $outcome.applicationId
if ($outcome.documentUrl) {
    $doc = Invoke-Api -Method Get -Url "$ApiBase$($outcome.documentUrl)"
    Test-Result "Generated document downloadable w/ AI banner" (
        $doc.Status -eq 200 -and $doc.Data -match "Lawyer review pending" -and $doc.Data -match "Smoke Admit Test"
    ) ("status=" + $doc.Status)
}

$detailAfterDraft = Invoke-Api -Method Get -Url "$ApiBase/api/v1/prisoners/$newPid" -Headers $superHdr
$appNow = $detailAfterDraft.Data.data.applications | Select-Object -First 1
Test-Result "Application auto-advanced to drafted" ($appNow.stage -eq "drafted") ("stage=" + $appNow.stage)

# ---------- review gating on filing ----------
$premature = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/stage" -Headers $superHdr -Body @{ stage = "filed" }
Test-Result "Filing without review blocked (REVIEW_REQUIRED)" (
    $premature.Status -in @(409, 422) -and $premature.Error -match "REVIEW_REQUIRED"
) ("status=" + $premature.Status + " body=" + $premature.Error)

$staffReviewAttempt = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$appId/review" -Headers $staffHdr
Test-Result "jail_staff cannot mark reviewed (403)" ($staffReviewAttempt.Status -eq 403) ("status=" + $staffReviewAttempt.Status)

$review = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$appId/review" -Headers $superHdr
Test-Result "Superintendent marks reviewed" (
    $review.Status -eq 200 -and $review.Data.data.reviewedBy
) ("status=" + $review.Status)

$filed = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/stage" -Headers $superHdr -Body @{ stage = "filed" }
Test-Result "After review, advance to filed succeeds" ($filed.Status -eq 200 -and $filed.Data.data.stage -eq "filed" -and $filed.Data.data.filedDate) ("status=" + $filed.Status)

# ---------- skill passport ----------
$programs = Invoke-Api -Method Get -Url "$ApiBase/api/v1/training-programs" -Headers $superHdr
Test-Result "Training catalog has ~10 programs" ($programs.Status -eq 200 -and $programs.Data.data.Count -ge 8) ("count=" + $programs.Data.data.Count)

$programId = $programs.Data.data[0].id
$enroll = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$newPid/enrollments" -Headers $superHdr -Body @{ programId = $programId }
Test-Result "Enroll prisoner in program (201)" ($enroll.Status -eq 201 -and $enroll.Data.data.id) ("status=" + $enroll.Status)
$enrollmentId = $enroll.Data.data.id

$dupEnroll = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$newPid/enrollments" -Headers $superHdr -Body @{ programId = $programId }
Test-Result "Duplicate enrollment rejected (409)" ($dupEnroll.Status -eq 409) ("status=" + $dupEnroll.Status)

$progress = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/enrollments/$enrollmentId" -Headers $superHdr -Body @{ progressPct = 60 }
Test-Result "Progress update to 60%" ($progress.Status -eq 200 -and $progress.Data.data.progressPct -eq 60) ("pct=" + $progress.Data.data.progressPct)

$complete = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/enrollments/$enrollmentId" -Headers $superHdr -Body @{ markComplete = $true }
Test-Result "Mark complete issues placeholder certificate" (
    $complete.Status -eq 200 -and $complete.Data.data.status -eq "completed" -and $complete.Data.data.certificateUrl
) ""
$cert = Invoke-Api -Method Get -Url "$ApiBase$($complete.Data.data.certificateUrl)"
Test-Result "Certificate downloadable" ($cert.Status -eq 200) ("status=" + $cert.Status)

# ---------- notes ----------
$note = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$newPid/notes" -Headers $superHdr -Body @{ body = "Smoke note: behaviour cooperative." }
Test-Result "Add note attributed to author" (
    $note.Status -eq 201 -and $note.Data.data.authorName.Length -gt 0
) ("author=" + $note.Data.data.authorName)

# ---------- RBAC negatives ----------
$sessViewer = Invoke-Login -Email "viewer@rihai.gov.in" -Password "Passw0rd!23"
$viewerHdr = @{ Authorization = "Bearer $($sessViewer.Body.accessToken)" }
$viewerNote = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$newPid/notes" -Headers $viewerHdr -Body @{ body = "should fail" }
Test-Result "Non-member viewer blocked from adding note (403)" ($viewerNote.Status -eq 403) ("status=" + $viewerNote.Status)

$crossList = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners" -Headers $viewerHdr
Test-Result "Cross-jail prisoner list blocked (403)" ($crossList.Status -eq 403) ("status=" + $crossList.Status)

Write-Output ""
Write-Output "=== stage log / task preview ==="
$detail = Invoke-Api -Method Get -Url "$ApiBase/api/v1/prisoners/$newPid" -Headers $superHdr
$app = $detail.Data.data.applications | Select-Object -First 1
Test-Result "Drafted stage records actor" ([bool]$app.stageHistory.drafted.byName) ("by=" + $app.stageHistory.drafted.byName)
Test-Result "Filed stage records actor" ([bool]$app.stageHistory.filed.byName) ("by=" + $app.stageHistory.filed.byName)
$appDto = Invoke-Api -Method Get -Url "$ApiBase/api/v1/applications/$appId" -Headers $superHdr
Test-Result "GET /applications/:id returns history dto" ($appDto.Status -eq 200 -and $appDto.Data.data.stageHistory.filed.at) ""
$sheet = Invoke-Api -Method Get -Url "$ApiBase/api/v1/applications/$appId/document" -Headers $superHdr
Test-Result "Task preview sheet renders (actors+banner)" (
    $sheet.Status -eq 200 -and $sheet.Data -match "STAGE HISTORY" -and $sheet.Data -match "Acted by" -and $sheet.Data -match "Lawyer review pending"
) ("status=" + $sheet.Status)

Write-Output ""
Write-Output ("RESULT: {0} passed, {1} failed" -f $script:passCount, $script:failCount)
if ($script:failCount -gt 0) {
    foreach ($f in $script:failures) { Write-Output ("  " + $f) }
    exit 1
}
exit 0
Write-Output "=== smoke cleanup ==="
$del = Invoke-Api -Method Delete -Url "$ApiBase/api/v1/prisoners/$newPid" -Headers $superHdr
Test-Result "Cleanup: smoke prisoner + dependents deleted" ($del.Status -eq 204) ("status=" + $del.Status)
$gone = Invoke-Api -Method Get -Url "$ApiBase/api/v1/prisoners/$newPid" -Headers $superHdr
Test-Result "Deleted prisoner no longer fetchable (404)" ($gone.Status -eq 404) ("status=" + $gone.Status)
Write-Output "=== prompt 4: court + legal aid ==="
$ct = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/court-tracking" -Headers $superHdr
Test-Result "Court tracking lists filed app" ($ct.Status -eq 200 -and [bool](@($ct.Data.data) | Where-Object { $_.applicationId -eq $appId })) ("rows=" + @($ct.Data.data).Count)

$sync = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$appId/sync-court-status" -Headers $superHdr
Test-Result "Court sync advances stage + outcome" (
    $sync.Status -eq 200 -and $sync.Data.data.orderOutcome -eq "granted" -and $sync.Data.data.application.stage -eq "order_passed"
) ("stage=" + $sync.Data.data.application.stage + " outcome=" + $sync.Data.data.orderOutcome)

$queue = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/legal-aid/unassigned" -Headers $superHdr
Test-Result "Assignment queue contains our app" ($queue.Status -eq 200 -and [bool](@($queue.Data.data.queue) | Where-Object { $_.applicationId -eq $appId })) ""

$rr = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$appId/assign-lawyer" -Headers $superHdr -Body @{ method = "round_robin" }
Test-Result "Round-robin assigns DLSA lawyer" ($rr.Status -eq 200 -and $rr.Data.data.lawyerName -match "Srivastava") ("got=" + $rr.Data.data.lawyerName)

$detail2 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/prisoners/$newPid" -Headers $superHdr
$app2 = $detail2.Data.data.applications | Select-Object -First 1
Test-Result "Profile shows assigned lawyer" ($app2.assignedLawyer -match "Srivastava") ("lawyer=" + $app2.assignedLawyer)

$prematureRelease = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/stage" -Headers $superHdr -Body @{ stage = "released" }
Test-Result "Release blocked before surety arranged (SURETY_PENDING)" (
    $prematureRelease.Status -in @(409, 422) -and $prematureRelease.Error -match "SURETY_PENDING"
) ("status=" + $prematureRelease.Status)

$suretySave = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/surety-status" -Headers $superHdr -Body @{
    bondAmount = 25000; suretyRequired = $true; suretyArranged = $true; notes = "One local surety verified"
}
Test-Result "Surety checklist saved (arranged)" ($suretySave.Status -eq 200 -and $suretySave.Data.data.suretyArranged) ""

$grantedList = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/legal-aid/granted" -Headers $superHdr
Test-Result "Granted list shows checklist row" ($grantedList.Status -eq 200 -and [bool](@($grantedList.Data.data) | Where-Object { $_.applicationId -eq $appId })) ""

$release = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/applications/$appId/stage" -Headers $superHdr -Body @{ stage = "released" }
Test-Result "After surety, release succeeds" ($release.Status -eq 200 -and $release.Data.data.stage -eq "released") ("stage=" + $release.Data.data.stage)

Write-Output ""
Write-Output ("RESULT: {0} passed, {1} failed" -f $script:passCount, $script:failCount)
if ($script:failCount -gt 0) {
    foreach ($f in $script:failures) { Write-Output ("  " + $f) }
    exit 1
}
exit 0




