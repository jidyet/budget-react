# ============================================================
# TrackToZero — Find All Debt Total Calculations
# Run this from your project root in VS Code PowerShell terminal:
#   .\find_debt_totals.ps1
# Or point it at a folder:
#   .\find_debt_totals.ps1 -Root "C:\path\to\your\project"
# ============================================================

param(
    [string]$Root = "."
)

$Divider = "─" * 60
$Extensions = @("*.js", "*.jsx", "*.ts", "*.tsx")
$Excludes = @("node_modules", ".next", "dist", "build", ".git")

function Search-Code {
    param(
        [string]$Label,
        [string]$Pattern
    )

    Write-Host ""
    Write-Host "▶ $Label" -ForegroundColor Cyan
    Write-Host $Divider -ForegroundColor DarkGray

    $results = @()

    foreach ($ext in $Extensions) {
        Get-ChildItem -Path $Root -Recurse -Filter $ext -ErrorAction SilentlyContinue |
        Where-Object {
            $path = $_.FullName
            -not ($Excludes | Where-Object { $path -match [regex]::Escape($_) })
        } |
        ForEach-Object {
            $file = $_.FullName
            $lineNum = 0
            Get-Content $file | ForEach-Object {
                $lineNum++
                if ($_ -match $Pattern) {
                    $results += [PSCustomObject]@{
                        File = $file.Replace((Resolve-Path $Root).Path, "").TrimStart("\")
                        Line = $lineNum
                        Content = $_.Trim()
                    }
                }
            }
        }
    }

    if ($results.Count -eq 0) {
        Write-Host "  (no matches)" -ForegroundColor DarkGray
    } else {
        foreach ($r in $results) {
            Write-Host "  $($r.File)" -ForegroundColor Yellow -NoNewline
            Write-Host ":$($r.Line)" -ForegroundColor Green -NoNewline
            Write-Host "  →  $($r.Content)" -ForegroundColor White
        }
    }
}

# -------------------------------------------------------
Write-Host ""
Write-Host "🔍 TrackToZero — Debt Total Calculation Scanner" -ForegroundColor Green
Write-Host $Divider -ForegroundColor DarkGray
Write-Host "Scanning: $(Resolve-Path $Root)" -ForegroundColor Gray
Write-Host ""

# 1. Balance reducers
Search-Code `
    -Label "1. Balance reducers (sum of balances without filter)" `
    -Pattern "\.reduce\(.*bal(ance)?"

# 2. totalDebt variable assignments
Search-Code `
    -Label "2. Variables named totalDebt / debtTotal / totalBalance" `
    -Pattern "(totalDebt|debtTotal|totalBalance|total_debt)\s*[=:]"

# 3. cur_bal / .balance being summed
Search-Code `
    -Label "3. cur_bal or .balance being summed anywhere" `
    -Pattern "\+\s*(.*\.balance|.*cur_bal|.*\.bal)\b"

# 4. progressEngine references
Search-Code `
    -Label "4. progressEngine / service files that mention debt" `
    -Pattern "(totalDebtLeft|debtLeft|paydownTotal|progressEngine)"

# 5. Where filters ARE applied (good patterns)
Search-Code `
    -Label "5. Where startsOverMonthly or billType filters ARE applied" `
    -Pattern "(startsOverMonthly|billType)"

# 6. Overview page references
Search-Code `
    -Label "6. Overview page / component references" `
    -Pattern "(OverviewPage|Overview\.jsx|Overview\.tsx|useOverview|overviewData)"

# 7. Household / Total Debt label in JSX
Search-Code `
    -Label "7. 'Household' or 'Total Debt' label references in code" `
    -Pattern "(?i)(household|total.debt|your household)"

# 8. Summary hooks / helpers
Search-Code `
    -Label "8. Summary helpers, hooks, or selectors" `
    -Pattern "(useSummary|useDebt|useTotals|useHousehold|getSummary|getDebtTotal|calcDebt)"

# -------------------------------------------------------
Write-Host ""
Write-Host $Divider -ForegroundColor DarkGray
Write-Host "✅ Scan complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  • Any hit in section 1 or 2 that does NOT also filter by"
Write-Host "    startsOverMonthly or billType is a bug candidate."
Write-Host "  • Paste results back here and I'll identify the exact fix."
Write-Host ""
