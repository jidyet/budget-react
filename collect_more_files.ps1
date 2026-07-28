# ============================================================
# TrackToZero — Collect More Tab Source Files
# Run from your project root:
#   Copy to project folder, then: .\collect_more_files.ps1
# ============================================================

$dest = "$env:USERPROFILE\Downloads\tracktozero_more_files"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$root = "D:\My Projects\budget-react"
$found = 0

$terms = @(
  "ADMIN TOOLS", "AdminTools", "adminTools",
  "Beta help", "BetaHelp", "betaHelp",
  "Help & FAQ", "HelpFaq", "helpFaq",
  "Notifications", "NotificationsPage", "notificationsPage",
  "Privacy", "PrivacyPage", "privacyPage",
  "SettingsPage", "settingsPage",
  "ImportPage", "importPage", "StatementUpload",
  "HistoryPage", "historyPage",
  "More menu", "MoreMenu", "moreMenu", "MoreNav", "moreNav",
  "ACCOUNT", "TOOLS", "SUPPORT",
  "Sign out", "signOut", "handleSignOut",
  "founderAccount", "isAdmin", "adminMode",
  "canAccessAdmin", "launchFlags",
  "Household", "householdSetup", "HouseholdSetup",
  "workspaceMode", "activeHousehold",
  "navigateTo", "AppPageContent"
)

Write-Host ""
Write-Host "Collecting More tab files..." -ForegroundColor Cyan
Write-Host "Destination: $dest"
Write-Host ""

Get-ChildItem -Path $root -Recurse -Include "*.js","*.jsx","*.ts","*.tsx" -ErrorAction SilentlyContinue |
Where-Object { $_.FullName -notmatch "node_modules|\.next|dist|build|\.git" } |
ForEach-Object {
    $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    foreach ($term in $terms) {
        if ($content -match [regex]::Escape($term)) {
            $destFile = Join-Path $dest $_.Name
            Copy-Item $_.FullName -Destination $destFile -Force
            Write-Host "  Copied: $($_.Name)" -ForegroundColor Green
            $found++
            break
        }
    }
}

Write-Host ""
Write-Host "$found file(s) copied to:" -ForegroundColor Cyan
Write-Host "  $dest"
Write-Host ""
Write-Host "Files found:" -ForegroundColor Yellow
Get-ChildItem $dest | Select-Object Name | Format-Table -HideTableHeaders
