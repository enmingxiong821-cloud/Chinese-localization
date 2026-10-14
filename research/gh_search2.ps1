param(
    [int]$PerPage = 8
)

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

$queries = @(
    'q=LunaTranslator',
    'q=Umi-OCR',
    'q=Textractor',
    'q=Translumo',
    'q=electron+%E6%B1%89%E5%8C%96',
    'q=%E6%B8%B8%E6%88%8F+%E6%B1%89%E5%8C%96+%E5%B7%A5%E5%85%B7',
    'q=%E8%B5%84%E6%BA%90+%E6%9B%BF%E6%8D%A2+%E6%B1%89%E5%8C%96',
    'q=windsurf+chinese',
    'q=trae+chinese',
    'q=codex+desktop+%E6%B1%89%E5%8C%96',
    'q=dll+injection+translation',
    'q=dxgi+overlay+translation',
    'q=ascii+patch+localization',
    'q=argos+translate+offline',
    'q=local+translation+model+bergamot',
    'q=on-screen+translation+windows',
    'q=ocr+overlay+translator+windows',
    'q=bilingual+subtitle+translate+player'
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
            Write-Output ("  {0,7}  {1}  [{2}]  {3}" -f $item.stargazers_count, $item.full_name, $item.language, $desc)
        }
    }
    catch {
        Write-Output "===== $q   FAILED: $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds 1200
}
