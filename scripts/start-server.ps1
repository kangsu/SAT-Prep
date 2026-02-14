param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
python -m http.server $Port
