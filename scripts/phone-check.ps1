param(
  [ValidateSet('inspect','tap','swipe','type','back','screenshot')][string]$Action='inspect',
  [string]$Target='', [string]$Value='',
  [int]$X1=632,[int]$Y1=2200,[int]$X2=632,[int]$Y2=900,
  [string]$OutputPath=''
)
$ErrorActionPreference='Stop'
$readerSerial='ZD2232K9Q8'
$connectedDevices=@(& adb devices | Select-Object -Skip 1)
if(-not ($connectedDevices | Where-Object {$_ -match "^$([regex]::Escape($readerSerial))\s+device$"})) {
  throw "Test phone $readerSerial is not connected and authorized. No action taken."
}
function Get-ReaderFocus {
  $value=(& adb -s $readerSerial shell dumpsys window | Select-String 'mCurrentFocus').ToString()
  if($value -notmatch 'com\.aireader/|com\.(google\.android|android)\.documentsui/') {throw 'Phone is outside AI Reader or its file picker. No action taken.'}
  return $value
}
$readerFocus=Get-ReaderFocus
if($Action -eq 'swipe') { & adb -s $readerSerial shell input swipe $X1 $Y1 $X2 $Y2 350; exit }
if($Action -eq 'back') { & adb -s $readerSerial shell input keyevent 4; exit }
if($Action -eq 'screenshot') {
  if($readerFocus -notmatch 'com\.aireader/') {throw 'Only AI Reader can be captured.'}
  if(-not $OutputPath) {throw 'An output path is required.'}
  & adb -s $readerSerial shell screencap -p /sdcard/ai-reader-p3-screen.png
  if((Get-ReaderFocus) -ne $readerFocus) {throw 'Focus changed; capture will not be displayed.'}
  & adb -s $readerSerial pull /sdcard/ai-reader-p3-screen.png $OutputPath
  exit
}
& adb -s $readerSerial shell uiautomator dump /sdcard/ai-reader-p3-ui.xml | Out-Null
[xml]$readerTree=(& adb -s $readerSerial shell cat /sdcard/ai-reader-p3-ui.xml) -join "`n"
$readerNodes=@($readerTree.SelectNodes('//node') | Where-Object {
  $_.package -eq 'com.aireader' -or ($_.package -match '^com\.(google\.android|android)\.documentsui$' -and (
    $_.text -match 'AI-Reader-P3|^Downloads$|^Download$|^Recent$|^Search|^Files$|^Open from$|^Internal storage$|^Choose|^Use this folder$' -or
    $_.'content-desc' -match '^Show roots$|^Search$|^More options$|^AI-Reader-P3|^List view$|^Grid view$|^New folder$' -or $_.class -eq 'android.widget.EditText'))
})
if($Action -eq 'inspect') {
  $readerNodes | Where-Object {$_.text -or $_.'content-desc'} | ForEach-Object {
    [pscustomobject]@{Text=$_.text;Label=$_.'content-desc';Bounds=$_.bounds;Clickable=$_.clickable;Class=$_.class}
  } | ConvertTo-Json -Compress -Depth 3
  exit
}
$readerMatches=@($readerNodes | Where-Object {$_.text -ceq $Target -or $_.'content-desc' -ceq $Target})
$readerButtons=@{}
foreach($readerMatch in $readerMatches) {
  $readerClick=$readerMatch
  while($readerClick -and $readerClick.clickable -ne 'true') {$readerClick=$readerClick.ParentNode}
  if($readerClick -and $readerClick.bounds) {$readerButtons[$readerClick.bounds]=$readerClick}
}
if($readerButtons.Count -ne 1) {throw "Expected one clickable target for '$Target'; found $($readerButtons.Count). Inspect the screen first."}
$readerButton=@($readerButtons.Values)[0]
if((Get-ReaderFocus) -ne $readerFocus) {throw 'Focus changed; no tap performed.'}
if($readerButton.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') {throw 'Invalid target bounds'}
$readerX=[int](([int]$Matches[1]+[int]$Matches[3])/2)
$readerY=[int](([int]$Matches[2]+[int]$Matches[4])/2)
& adb -s $readerSerial shell input tap $readerX $readerY
if($Action -eq 'type') {
  if($Value -notmatch '^[A-Za-z0-9 _.-]*$') {throw 'This helper only types simple fixture text.'}
  if((Get-ReaderFocus) -ne $readerFocus) {throw 'Focus changed; text not entered.'}
  & adb -s $readerSerial shell input keycombination 113 29
  & adb -s $readerSerial shell input keyevent 67
  if($Value) { & adb -s $readerSerial shell input text ($Value.Replace(' ','%s')) }
}
"Action $Action completed for $Target"
