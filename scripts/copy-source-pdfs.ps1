param(
  [string]$EnglishSource = "C:\Users\kagatlin\OneDrive - Microsoft\Desktop\SAT\English Hard.pdf",
  [string]$MathSource = "C:\Users\kagatlin\OneDrive - Microsoft\Desktop\SAT\Math Hard.pdf",
  [string]$Destination = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $Destination = Join-Path $PSScriptRoot "..\assets\pdfs"
}

$Destination = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$englishTarget = Join-Path $Destination "English Hard.pdf"
$mathTarget = Join-Path $Destination "Math Hard.pdf"

Copy-Item -Path $EnglishSource -Destination $englishTarget -Force
Copy-Item -Path $MathSource -Destination $mathTarget -Force

Write-Host "Copied:"
Write-Host " - $englishTarget"
Write-Host " - $mathTarget"
