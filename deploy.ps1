# Deploy Petstores MCP server to Azure Container Apps
# Uses existing ACR from petbarn-acp-demo-rg

param(
    [string]$ResourceGroup = "petstores-mcp-rg",
    [string]$AppName = "petstores-mcp",
    [string]$Location = "australiaeast",
    [string]$AcrResourceGroup = "petbarn-acp-demo-rg",
    [string]$EnvironmentName = "petstores-mcp-env"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying Petstores MCP server to Azure Container Apps" -ForegroundColor Cyan

# Step 1: Get existing ACR from petbarn-acp-demo-rg
Write-Host "`n📦 Finding existing Azure Container Registry..." -ForegroundColor Yellow
$acrList = az acr list --resource-group $AcrResourceGroup --query "[0]" -o json | ConvertFrom-Json

if (-not $acrList) {
    Write-Host "❌ No ACR found in $AcrResourceGroup. Please deploy acpdemo first or create an ACR." -ForegroundColor Red
    exit 1
}

$AcrName = $acrList.name
$AcrLoginServer = $acrList.loginServer
Write-Host "✅ Found ACR: $AcrName ($AcrLoginServer)" -ForegroundColor Green

# Step 2: Create resource group for chatgptapp
Write-Host "`n📁 Creating resource group: $ResourceGroup..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output none
Write-Host "✅ Resource group created" -ForegroundColor Green

# Step 3: Build and push image to ACR
$ImageName = "$AcrLoginServer/${AppName}:latest"
Write-Host "`n🔨 Building and pushing image to ACR..." -ForegroundColor Yellow
Write-Host "   Image: $ImageName" -ForegroundColor Gray
az acr build --registry $AcrName --image "${AppName}:latest" --file Dockerfile .
Write-Host "✅ Image built and pushed" -ForegroundColor Green

# Step 4: Create Container Apps Environment
Write-Host "`n🌐 Creating Container Apps Environment: $EnvironmentName..." -ForegroundColor Yellow
$envExists = az containerapp env show --name $EnvironmentName --resource-group $ResourceGroup 2>$null
if (-not $envExists) {
    az containerapp env create `
        --name $EnvironmentName `
        --resource-group $ResourceGroup `
        --location $Location `
        --output none
    Write-Host "✅ Container Apps Environment created" -ForegroundColor Green
} else {
    Write-Host "✅ Container Apps Environment already exists" -ForegroundColor Green
}

# Step 5: Enable admin access on ACR for Container Apps to pull images
Write-Host "`n🔑 Enabling ACR admin access..." -ForegroundColor Yellow
az acr update --name $AcrName --admin-enabled true --output none
$acrCredentials = az acr credential show --name $AcrName -o json | ConvertFrom-Json
$acrUsername = $acrCredentials.username
$acrPassword = $acrCredentials.passwords[0].value
Write-Host "✅ ACR admin access enabled" -ForegroundColor Green

# Step 6: Deploy Container App
Write-Host "`n🚀 Deploying Container App: $AppName..." -ForegroundColor Yellow
az containerapp create `
    --name $AppName `
    --resource-group $ResourceGroup `
    --environment $EnvironmentName `
    --image $ImageName `
    --target-port 8787 `
    --ingress external `
    --registry-server $AcrLoginServer `
    --registry-username $acrUsername `
    --registry-password $acrPassword `
    --min-replicas 0 `
    --max-replicas 3 `
    --cpu 0.5 `
    --memory 1Gi `
    --output none

Write-Host "✅ Container App deployed" -ForegroundColor Green

# Step 7: Get the app URL
Write-Host "`n📋 Getting app URL..." -ForegroundColor Yellow
$appUrl = az containerapp show `
    --name $AppName `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" `
    -o tsv

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n🌐 App URL: https://$appUrl" -ForegroundColor White
Write-Host "🛒 Web Page: https://$appUrl/petbarn" -ForegroundColor White
Write-Host "🔌 MCP Endpoint: https://$appUrl/mcp" -ForegroundColor White
Write-Host "`n"
