# ============================================================
# TrackToZero — Collect Payoff Page Source Files
# Run from your project root:
#   .\collect_payoff_files.ps1
# ============================================================

param(
    [string]$Root = ".",
    [string]$Dest = "$env:USERPROFILE\Downloads\tracktozero_payoff_files"
)

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$Extensions = @("*.js", "*.jsx", "*.ts", "*.tsx")
$Excludes   = @("node_modules", ".next", "dist", "build", ".git")

function Find-And-Copy {
    param([string[]]$Terms)
    foreach ($term in $Terms) {
        foreach ($ext in $Extensions) {
            Get-ChildItem -Path $Root -Recurse -Filter $ext -ErrorAction SilentlyContinue |
            Where-Object { $path = $_.FullName; -not ($Excludes | Where-Object { $path -match [regex]::Escape($_) }) } |
            ForEach-Object {
                $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
                if ($content -match [regex]::Escape($term)) {
                    $dest = Join-Path $Dest $_.Name
                    Copy-Item $_.FullName -Destination $dest -Force
                    Write-Host "  Copied: $($_.FullName)" -ForegroundColor Green
                }
            }
        }
    }
}

Write-Host ""
Write-Host "TrackToZero — Collecting Payoff page files" -ForegroundColor Cyan
Write-Host "Destination: $Dest"
Write-Host ""

# ── 1. Payoff page component ────────────────────────────────
Write-Host "Searching for Payoff page component..." -ForegroundColor Yellow
Find-And-Copy @(
    "PayoffPage",
    "Payoff page",
    "payoffPage",
    "GET TO ZERO",
    "PICK YOUR APPROACH",
    "Avalanche",
    "Snowball",
    "SET YOUR GOAL DATE",
    "Show My Path to Zero",
    "WHAT IF I PAY",
    "WHAT'S IN YOUR PLAN",
    "SAVE YOUR PLAN",
    "YOUR PAYOFF SUMMARY"
)

# ── 2. Payoff simulation / calculation engine ───────────────
Write-Host ""
Write-Host "Searching for payoff calculation engine..." -ForegroundColor Yellow
Find-And-Copy @(
    "payoffSimulate",
    "simulatePayoff",
    "payoffEngine",
    "avalanchePayoff",
    "snowballPayoff",
    "monthsToPayoff",
    "totalInterest",
    "extraPayment",
    "payoffMonths",
    "payoffPlan"
)

# ── 3. Plan saving / saved plans ────────────────────────────
Write-Host ""
Write-Host "Searching for plan save logic..." -ForegroundColor Yellow
Find-And-Copy @(
    "savedPlan",
    "SavedPlan",
    "savePlan",
    "usePayoffPlan",
    "payoffPlanService",
    "Extra Bofa"
)

# ── 4. Strategy selection (Avalanche/Snowball) ──────────────
Write-Host ""
Write-Host "Searching for strategy selector..." -ForegroundColor Yellow
Find-And-Copy @(
    "avalanche",
    "snowball",
    "payoffStrategy",
    "PayoffStrategy",
    "useStrategy",
    "strategyMode"
)

# ── 5. Debt selection list in plan builder ──────────────────
Write-Host ""
Write-Host "Searching for plan debt list..." -ForegroundColor Yellow
Find-And-Copy @(
    "debtsIncluded",
    "includedDebts",
    "debtList",
    "planDebts",
    "0 of 57",
    "debts included",
    "Add all",
    "Remove all"
)

# ── 6. Extra payment calculator ─────────────────────────────
Write-Host ""
Write-Host "Searching for extra payment calculator..." -ForegroundColor Yellow
Find-And-Copy @(
    "extraPayment",
    "seeTheDifference",
    "See the difference",
    "monthsYoudSave",
    "withExtra",
    "MONTHS YOU'D SAVE",
    "WITH EXTRA"
)

# ── Summary ─────────────────────────────────────────────────
$files = Get-ChildItem -Path $Dest
Write-Host ""
Write-Host "────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "Done. $($files.Count) file(s) collected in:" -ForegroundColor Green
Write-Host "  $Dest" -ForegroundColor White
Write-Host ""
Write-Host "Files found:" -ForegroundColor Cyan
$files | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host ""
Write-Host "Next step: drag and drop these files into the Claude chat." -ForegroundColor Yellow
Write-Host ""
