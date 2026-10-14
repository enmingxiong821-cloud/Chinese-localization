# GitHub repository search harness (ASCII-only queries, pre URL-encoded).
# Usage: pwsh -File research/gh_search.ps1
param(
    [int]$PerPage = 8
)

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

$queries = @(
    'q=%E6%B1%89%E5%8C%96+in%3Aname%2Cdescription%2Creadme',
    'q=%E6%B1%89%E5%8C%96%E8%A1%A5%E4%B8%81',
    'q=%E4%B8%AD%E6%96%87%E5%8C%96+in%3Aname%2Cdescription',
    'q=%E5%AE%9E%E6%97%B6%E7%BF%BB%E8%AF%91',
    'q=%E5%B1%8F%E5%B9%95%E7%BF%BB%E8%AF%91',
    'q=%E5%88%92%E8%AF%8D%E7%BF%BB%E8%AF%91',
    'q=%E7%BF%BB%E8%AF%91%E6%8F%92%E4%BB%B6+in%3Aname%2Cdescription',
    'q=chinese+injector',
    'q=chinese+localization+patch+electron',
    'q=screen+translator+ocr+in%3Aname%2Cdescription',
    'q=realtime+translation+overlay',
    'q=immersive+translate',
    'q=text+hook+translator+visual+novel',
    'q=asar+inject+translate',
    'q=cursor+chinese',
    'q=claude+desktop+chinese',
    'q=vscode+language+pack+chinese',
    'q=game+translation+tool+ocr'
)

foreach ($q in $queries) {
    $url = "https://api.github.com/search/repositories?$q&sort=stars&order=desc&per_page=$PerPage"
    try {
        $r = Invoke-RestMethod -Uri $url -TimeoutSec 30 -Headers @{ 'User-Agent' = 'codex-research' }
        $decoded = [System.Uri]::UnescapeDataString($q)
        Write-Output "===== $decoded   total=$($r.total_count)"
        foreach ($item in $r.items) {
            $desc = $item.description
            if ($null -eq $desc) { $desc = '' }
            $desc = ($desc -replace '\r?\n', ' ')
            if ($desc.Length -gt 120) { $desc = $desc.Substring(0, 120) }
            $stars = $item.stargazers_count
            Write-Output ("  {0,7}  {1}  [{2}]  {3}" -f $stars, $item.full_name, $item.language, $desc)
        }
    }
    catch {
        Write-Output "===== $q   FAILED: $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds 1200
}
