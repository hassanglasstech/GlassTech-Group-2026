# Nippon Physical Inventory Verification Workbook Builder
# Uses runtime control creation in UserForm_Initialize (reliable across save/reload)

$ErrorActionPreference = "Stop"

$OUTPUT_PATH = "C:\Users\PC\Downloads\NipponInventoryVerification.xlsm"
$SOURCE_PATH = "C:\Users\PC\Downloads\Nippon_Products_CLEAN (3).xlsx"

if (Test-Path $OUTPUT_PATH) { Remove-Item $OUTPUT_PATH -Force }

Get-Process EXCEL -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "Opening Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$srcWB = $excel.Workbooks.Open($SOURCE_PATH)
$srcWS = $srcWB.Worksheets("All Products")
$srcRows = $srcWS.UsedRange.Rows.Count

$wb = $excel.Workbooks.Add()
while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets(2).Delete() }

# README
$ws = $wb.Worksheets(1)
$ws.Name = "README"
$readme = @(
    "NIPPON PHYSICAL INVENTORY VERIFICATION WORKBOOK",
    "",
    "Open with macros enabled. The form will appear automatically.",
    "",
    "How to use:",
    "  1. Search by Item Name, Internal Code, or DB ID.",
    "  2. Click a match in the list. Details auto-fill.",
    "  3. Edit any field, then 'Save Changes' to update Register.",
    "  4. Enter OB Qty, Date, Location, Counted By, Remarks.",
    "  5. Click 'Save OB' to log the physical count.",
    "  6. 'Mark Ghost' if product does not exist physically.",
    "  7. 'Delete Permanently' for hard delete (double confirm).",
    "",
    "Every action is logged to ChangeLog with timestamp + user.",
    "Saving an OB entry also auto-promotes status from To-Verify to Active.",
    "",
    "Status colors in Register:",
    "  Green = Active | Yellow = To-Verify | Red = Ghost | Gray = Discontinued",
    "",
    ("Designed: " + (Get-Date -Format 'yyyy-MM-dd'))
)
for ($i = 0; $i -lt $readme.Count; $i++) { $ws.Cells($i + 1, 1).Value2 = $readme[$i] }
$ws.Cells(1, 1).Font.Size = 16
$ws.Cells(1, 1).Font.Bold = $true
$ws.Cells(1, 1).Interior.Color = 1714018
$ws.Cells(1, 1).Font.Color = 16777215
$ws.Columns("A").ColumnWidth = 90
$ws.Tab.Color = 1714018

# Register
$reg = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $ws)
$reg.Name = "Register"
$regHeaders = @(
    "DB_ID","Internal_Code","Item_Name","Brand","Category","Sub_Category",
    "Color","Direction","Material","Unit_Price","Unit","Description",
    "Image_Path","Status","Last_OB_Qty","Last_OB_Date","Last_OB_Location",
    "Last_Modified","Modified_By","Notes"
)
for ($c = 0; $c -lt $regHeaders.Count; $c++) { $reg.Cells(1, $c+1).Value2 = $regHeaders[$c] }
$hdr = $reg.Range($reg.Cells(1,1), $reg.Cells(1, $regHeaders.Count))
$hdr.Font.Bold = $true
$hdr.Interior.Color = 1714018
$hdr.Font.Color = 16777215
$hdr.HorizontalAlignment = -4108
$reg.Rows(1).RowHeight = 28
$reg.Application.ActiveWindow.SplitRow = 1
$reg.Application.ActiveWindow.FreezePanes = $true

Write-Host "Copying product rows..."
$destRow = 2
for ($r = 4; $r -le $srcRows; $r++) {
    $code      = $srcWS.Cells($r,1).Text.Trim()
    $itemName  = $srcWS.Cells($r,2).Text.Trim()
    $category  = $srcWS.Cells($r,3).Text.Trim()
    $subCat    = $srcWS.Cells($r,4).Text.Trim()
    $color     = $srcWS.Cells($r,5).Text.Trim()
    $direction = $srcWS.Cells($r,6).Text.Trim()
    $material  = $srcWS.Cells($r,10).Text.Trim()
    $priceTxt  = $srcWS.Cells($r,11).Text.Trim().Replace(",","")
    $unit      = $srcWS.Cells($r,12).Text.Trim()
    $dbId      = $srcWS.Cells($r,15).Text.Trim()
    $brand     = $srcWS.Cells($r,16).Text.Trim()
    $origDesc  = $srcWS.Cells($r,17).Text.Trim()
    $imgPath   = $srcWS.Cells($r,18).Text.Trim()
    if ($dbId -eq "") { continue }
    $reg.Cells($destRow,1).Value2 = $dbId
    $reg.Cells($destRow,2).Value2 = $code
    $reg.Cells($destRow,3).Value2 = $itemName
    $reg.Cells($destRow,4).Value2 = $brand
    $reg.Cells($destRow,5).Value2 = $category
    $reg.Cells($destRow,6).Value2 = $subCat
    $reg.Cells($destRow,7).Value2 = $color
    $reg.Cells($destRow,8).Value2 = $direction
    $reg.Cells($destRow,9).Value2 = $material
    if ($priceTxt -match '^[0-9]+(\.[0-9]+)?$') { $reg.Cells($destRow,10).Value = [double]$priceTxt }
    $reg.Cells($destRow,11).Value2 = $unit
    $reg.Cells($destRow,12).Value2 = $origDesc
    $reg.Cells($destRow,13).Value2 = $imgPath
    $reg.Cells($destRow,14).Value2 = "To-Verify"
    $destRow++
}
$lastDataRow = $destRow - 1

$reg.Columns("A:T").AutoFit() | Out-Null
$reg.Columns("A").ColumnWidth = 22
$reg.Columns("C").ColumnWidth = 35
$reg.Columns("L").ColumnWidth = 45
$reg.Columns("J").NumberFormat = "#,##0"
$reg.Columns("O").NumberFormat = "#,##0.##"
$reg.Columns("P").NumberFormat = "yyyy-mm-dd"
$reg.Columns("R").NumberFormat = "yyyy-mm-dd hh:mm"

$statusRng = $reg.Range($reg.Cells(2,14), $reg.Cells(1000,14))
$cf1 = $statusRng.FormatConditions.Add(1, 3, "=""Active""")
$cf1.Interior.Color = 13434828
$cf2 = $statusRng.FormatConditions.Add(1, 3, "=""Ghost""")
$cf2.Interior.Color = 13408767
$cf3 = $statusRng.FormatConditions.Add(1, 3, "=""Discontinued""")
$cf3.Interior.Color = 14277081
$cf4 = $statusRng.FormatConditions.Add(1, 3, "=""To-Verify""")
$cf4.Interior.Color = 10092543

$reg.Tab.Color = 1714018

# OpeningBalances
$ob = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $reg)
$ob.Name = "OpeningBalances"
$obHeaders = @("OB_Ref","Count_Date","DB_ID","Item_Name","Qty","Unit","Location","Counted_By","Remarks","Entered_At","Entered_By")
for ($c = 0; $c -lt $obHeaders.Count; $c++) { $ob.Cells(1, $c+1).Value2 = $obHeaders[$c] }
$obHdr = $ob.Range($ob.Cells(1,1), $ob.Cells(1, $obHeaders.Count))
$obHdr.Font.Bold = $true
$obHdr.Interior.Color = 4495424
$obHdr.Font.Color = 16777215
$ob.Columns("A").ColumnWidth = 22
$ob.Columns("D").ColumnWidth = 32
$ob.Columns("B").NumberFormat = "yyyy-mm-dd"
$ob.Columns("J").NumberFormat = "yyyy-mm-dd hh:mm"
$ob.Tab.Color = 4495424

# ChangeLog
$cl = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $ob)
$cl.Name = "ChangeLog"
$clHeaders = @("Log_Ref","Timestamp","DB_ID","Action","Field","Old_Value","New_Value","User")
for ($c = 0; $c -lt $clHeaders.Count; $c++) { $cl.Cells(1, $c+1).Value2 = $clHeaders[$c] }
$clHdr = $cl.Range($cl.Cells(1,1), $cl.Cells(1, $clHeaders.Count))
$clHdr.Font.Bold = $true
$clHdr.Interior.Color = 7884328
$clHdr.Font.Color = 16777215
$cl.Columns("B").NumberFormat = "yyyy-mm-dd hh:mm:ss"
$cl.Tab.Color = 7884328

# Dashboard
$dash = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $cl)
$dash.Name = "Dashboard"
$dash.Cells(1,1).Value2 = "NIPPON INVENTORY VERIFICATION - LIVE DASHBOARD"
$dash.Cells(1,1).Font.Size = 16
$dash.Cells(1,1).Font.Bold = $true
$dash.Cells(1,1).Interior.Color = 1714018
$dash.Cells(1,1).Font.Color = 16777215
$dash.Range("A1:F1").Merge()
$dash.Rows(1).RowHeight = 30
$dash.Cells(3,1).Value2 = "METRIC"
$dash.Cells(3,2).Value2 = "COUNT"
$dash.Range("A3:B3").Font.Bold = $true
$dash.Range("A3:B3").Interior.Color = 14277081

$metrics = @(
    @("Total products",        "=COUNTA(Register!A:A)-1"),
    @("Active",                '=COUNTIF(Register!N:N,"Active")'),
    @("Ghost",                 '=COUNTIF(Register!N:N,"Ghost")'),
    @("Discontinued",          '=COUNTIF(Register!N:N,"Discontinued")'),
    @("To-Verify",             '=COUNTIF(Register!N:N,"To-Verify")'),
    @("Total OB entries",      "=COUNTA(OpeningBalances!A:A)-1"),
    @("OB entries today",      "=COUNTIFS(OpeningBalances!B:B,TODAY())"),
    @("ChangeLog entries",     "=COUNTA(ChangeLog!A:A)-1")
)
for ($i = 0; $i -lt $metrics.Count; $i++) {
    $dash.Cells(4+$i, 1).Value2 = $metrics[$i][0]
    $dash.Cells(4+$i, 2).Formula = $metrics[$i][1]
}
$dash.Columns("A").ColumnWidth = 35
$dash.Columns("B").ColumnWidth = 15
$dash.Range("A4:B11").Borders.LineStyle = 1
$dash.Tab.Color = 1714018

$ws.Move($wb.Worksheets(1))
$wb.Worksheets("Register").Activate()
$srcWB.Close($false)

Write-Host "Saving .xlsm..."
$wb.SaveAs($OUTPUT_PATH, 52)
Write-Host "Saved with $lastDataRow rows. Injecting VBA..."

# ═══════════════════════════════════════════════════════════════════
# VBA: helpers module
# ═══════════════════════════════════════════════════════════════════
$vbProj = $wb.VBProject
$mdl = $vbProj.VBComponents.Add(1)
$mdl.Name = "mdlHelpers"

$h = @()
$h += "Option Explicit"
$h += ""
$h += "Public Const SH_REGISTER As String = ""Register"""
$h += "Public Const SH_OB As String = ""OpeningBalances"""
$h += "Public Const SH_LOG As String = ""ChangeLog"""
$h += ""
$h += "Public Function RegisterLastRow() As Long"
$h += "    With ThisWorkbook.Worksheets(SH_REGISTER)"
$h += "        RegisterLastRow = .Cells(.Rows.Count, 1).End(xlUp).Row"
$h += "    End With"
$h += "End Function"
$h += ""
$h += "Public Function FindRowByDBID(ByVal dbId As String) As Long"
$h += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$h += "    Dim lastRow As Long: lastRow = RegisterLastRow()"
$h += "    Dim r As Long"
$h += "    For r = 2 To lastRow"
$h += "        If CStr(ws.Cells(r, 1).Value) = dbId Then FindRowByDBID = r: Exit Function"
$h += "    Next r"
$h += "    FindRowByDBID = 0"
$h += "End Function"
$h += ""
$h += "Public Sub WriteLog(ByVal dbId As String, ByVal action As String, ByVal field As String, ByVal oldVal As String, ByVal newVal As String)"
$h += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_LOG)"
$h += "    Dim r As Long: r = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1"
$h += "    If r < 2 Then r = 2"
$h += "    ws.Cells(r, 1).Value = ""LOG-"" & Format(Now, ""yyyymmdd-hhmmss"") & ""-"" & r"
$h += "    ws.Cells(r, 2).Value = Now"
$h += "    ws.Cells(r, 3).Value = dbId"
$h += "    ws.Cells(r, 4).Value = action"
$h += "    ws.Cells(r, 5).Value = field"
$h += "    ws.Cells(r, 6).Value = oldVal"
$h += "    ws.Cells(r, 7).Value = newVal"
$h += "    ws.Cells(r, 8).Value = Environ(""USERNAME"")"
$h += "End Sub"
$h += ""
$h += "Public Function NextOBRef() As String"
$h += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_OB)"
$h += "    Dim lastRow As Long: lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row"
$h += "    Dim today As String: today = Format(Date, ""yyyymmdd"")"
$h += "    Dim cnt As Long: cnt = 0"
$h += "    Dim r As Long"
$h += "    For r = 2 To lastRow"
$h += "        If InStr(CStr(ws.Cells(r, 1).Value), ""OB-"" & today) > 0 Then cnt = cnt + 1"
$h += "    Next r"
$h += "    NextOBRef = ""OB-"" & today & ""-"" & Format(cnt + 1, ""0000"")"
$h += "End Function"
$h += ""
$h += "Public Sub SetCellIfChanged(ByVal ws As Worksheet, ByVal r As Long, ByVal c As Long, ByVal newVal As Variant, ByVal dbId As String, ByVal fieldName As String)"
$h += "    Dim oldVal As String: oldVal = CStr(ws.Cells(r, c).Value)"
$h += "    If oldVal <> CStr(newVal) Then"
$h += "        WriteLog dbId, ""EDIT"", fieldName, oldVal, CStr(newVal)"
$h += "        ws.Cells(r, c).Value = newVal"
$h += "    End If"
$h += "End Sub"
$h += ""
$h += "Public Sub ShowInventoryForm()"
$h += "    frmInventory.Show vbModeless"
$h += "End Sub"

$mdl.CodeModule.AddFromString(($h -join "`r`n"))

# ThisWorkbook
$tw = $wb.VBProject.VBComponents("ThisWorkbook").CodeModule
$open = @(
    "Private Sub Workbook_Open()",
    "    On Error Resume Next",
    "    frmInventory.Show vbModeless",
    "End Sub"
) -join "`r`n"
$tw.AddFromString($open)

# ═══════════════════════════════════════════════════════════════════
# UserForm with RUNTIME control building (controls created in Initialize)
# ═══════════════════════════════════════════════════════════════════
$frm = $vbProj.VBComponents.Add(3)
$frm.Name = "frmInventory"
$frmProps = $frm.Properties
$frmProps.Item("Caption").Value = "Nippon Inventory Verification - Physical Count"
$frmProps.Item("Width").Value = 600
$frmProps.Item("Height").Value = 640

Write-Host "Writing form code (runtime controls)..."

$f = @()
$f += "Option Explicit"
$f += ""
$f += "' Runtime-created controls (WithEvents for buttons + listbox)"
$f += "Private WithEvents btnSearch As MSForms.CommandButton"
$f += "Private WithEvents btnSaveEdit As MSForms.CommandButton"
$f += "Private WithEvents btnSaveOB As MSForms.CommandButton"
$f += "Private WithEvents btnMarkGhost As MSForms.CommandButton"
$f += "Private WithEvents btnMarkActive As MSForms.CommandButton"
$f += "Private WithEvents btnDelete As MSForms.CommandButton"
$f += "Private WithEvents btnClear As MSForms.CommandButton"
$f += "Private WithEvents btnClose As MSForms.CommandButton"
$f += "Private WithEvents lstMatches As MSForms.ListBox"
$f += "Private WithEvents txtSearchValue As MSForms.TextBox"
$f += ""
$f += "Private currentRow As Long"
$f += ""
$f += "Private Sub UserForm_Initialize()"
$f += "    Me.Caption = ""Nippon Inventory Verification - Physical Count"""
$f += "    Me.Width = 600: Me.Height = 640"
$f += "    BuildControls"
$f += "    currentRow = 0"
$f += "End Sub"
$f += ""
$f += "Private Sub BuildControls()"
$f += "    Dim c As Object, y As Long"
$f += ""
$f += "    ' --- Search row ---"
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", ""lblSearchBy"", True): c.Caption = ""Search by:"": c.Top = 8: c.Left = 8: c.Width = 60"
$f += "    Set c = Me.Controls.Add(""Forms.ComboBox.1"", ""cmbSearchField"", True): c.Top = 6: c.Left = 72: c.Width = 110"
$f += "    c.AddItem ""Item Name"": c.AddItem ""Internal Code"": c.AddItem ""DB ID"": c.Value = ""Item Name"""
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", ""lblValue"", True): c.Caption = ""Value:"": c.Top = 8: c.Left = 192: c.Width = 40"
$f += "    Set txtSearchValue = Me.Controls.Add(""Forms.TextBox.1"", ""txtSearchValue"", True)"
$f += "    txtSearchValue.Top = 6: txtSearchValue.Left = 234: txtSearchValue.Width = 220"
$f += "    Set btnSearch = Me.Controls.Add(""Forms.CommandButton.1"", ""btnSearch"", True)"
$f += "    btnSearch.Caption = ""Search"": btnSearch.Top = 6: btnSearch.Left = 462: btnSearch.Width = 110: btnSearch.Height = 22"
$f += ""
$f += "    ' --- Match list ---"
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", ""lblMatches"", True): c.Caption = ""Matches (click to load):"": c.Top = 32: c.Left = 8: c.Width = 200"
$f += "    Set lstMatches = Me.Controls.Add(""Forms.ListBox.1"", ""lstMatches"", True)"
$f += "    lstMatches.Top = 48: lstMatches.Left = 8: lstMatches.Width = 564: lstMatches.Height = 60"
$f += "    lstMatches.ColumnCount = 4: lstMatches.ColumnWidths = ""120;90;200;100"""
$f += ""
$f += "    ' --- Detail fields ---"
$f += "    y = 120"
$f += "    AddLabelTextRow ""lblDBID"", ""DB ID:"", ""txtDBID"", y, True"
$f += "    AddLabelTextRow ""lblCode"", ""Internal Code:"", ""txtCode"", y, False, 290"
$f += "    y = y + 24"
$f += "    AddLabelTextRowWide ""lblName"", ""Item Name:"", ""txtName"", y"
$f += "    y = y + 24"
$f += "    AddLabelComboRow ""lblBrand"", ""Brand:"", ""cmbBrand"", y, Array(""KIN LONG"", ""Hopo"", ""NINGBO WIDEN"", ""FROISE"", ""SOLERON"", ""Harris"", ""SIWAY"", ""HONGKONG HUANGXING"", ""Unknown"")"
$f += "    AddLabelComboRow ""lblStatus"", ""Status:"", ""cmbStatus"", y, Array(""Active"", ""To-Verify"", ""Ghost"", ""Discontinued""), 290"
$f += "    y = y + 24"
$f += "    AddLabelComboRow ""lblCategory"", ""Category:"", ""cmbCategory"", y, Array(""Window"", ""Sliding"", ""Door"", ""Lift and Slide"", ""Consumable"", ""Mesh Netting"", ""Glass Fitting"", ""Hardware"", ""Handle"", ""Support/Block"", ""Transmission Rod"")"
$f += "    AddLabelTextRow ""lblSub"", ""Sub-Category:"", ""txtSubCategory"", y, False, 290"
$f += "    y = y + 24"
$f += "    AddLabelTextRow ""lblColor"", ""Color:"", ""txtColor"", y, False"
$f += "    AddLabelComboRow ""lblDir"", ""Direction:"", ""cmbDirection"", y, Array("""", ""Left"", ""Right"", ""L/R""), 290"
$f += "    y = y + 24"
$f += "    AddLabelTextRow ""lblMat"", ""Material:"", ""txtMaterial"", y, False"
$f += "    AddLabelComboRow ""lblUnit"", ""Unit:"", ""cmbUnit"", y, Array(""PCS"", ""SET"", ""RFT"", ""KG"", ""MTR"", ""BOX"", ""ROLL""), 290"
$f += "    y = y + 24"
$f += "    AddLabelTextRow ""lblPrice"", ""Unit Price:"", ""txtPrice"", y, False"
$f += "    AddLabelTextRow ""lblImg"", ""Image Path:"", ""txtImage"", y, False, 290"
$f += "    y = y + 24"
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", ""lblDesc"", True): c.Caption = ""Description:"": c.Top = y: c.Left = 8: c.Width = 80"
$f += "    Set c = Me.Controls.Add(""Forms.TextBox.1"", ""txtDesc"", True): c.Top = y: c.Left = 92: c.Width = 462: c.Height = 32: c.MultiLine = True"
$f += "    y = y + 38"
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", ""lblNotes"", True): c.Caption = ""Notes:"": c.Top = y: c.Left = 8: c.Width = 80"
$f += "    Set c = Me.Controls.Add(""Forms.TextBox.1"", ""txtNotes"", True): c.Top = y: c.Left = 92: c.Width = 462: c.Height = 16"
$f += ""
$f += "    ' --- OB Frame ---"
$f += "    y = y + 28"
$f += "    Dim fr As MSForms.Frame"
$f += "    Set fr = Me.Controls.Add(""Forms.Frame.1"", ""frOB"", True)"
$f += "    fr.Caption = ""Opening Balance Entry"": fr.Top = y: fr.Left = 8: fr.Width = 562: fr.Height = 96"
$f += "    fr.ForeColor = RGB(20, 80, 140): fr.Font.Bold = True"
$f += ""
$f += "    Set c = fr.Controls.Add(""Forms.Label.1"", ""lblOBQty"", True): c.Caption = ""OB Qty:"": c.Top = 14: c.Left = 8: c.Width = 60"
$f += "    Set c = fr.Controls.Add(""Forms.TextBox.1"", ""txtOBQty"", True): c.Top = 14: c.Left = 72: c.Width = 90"
$f += "    Set c = fr.Controls.Add(""Forms.Label.1"", ""lblOBDate"", True): c.Caption = ""Count Date:"": c.Top = 14: c.Left = 172: c.Width = 70"
$f += "    Set c = fr.Controls.Add(""Forms.TextBox.1"", ""txtOBDate"", True): c.Top = 14: c.Left = 244: c.Width = 100"
$f += "    Set c = fr.Controls.Add(""Forms.Label.1"", ""lblOBLoc"", True): c.Caption = ""Location:"": c.Top = 14: c.Left = 354: c.Width = 60"
$f += "    Set c = fr.Controls.Add(""Forms.TextBox.1"", ""txtOBLocation"", True): c.Top = 14: c.Left = 418: c.Width = 130"
$f += ""
$f += "    Set c = fr.Controls.Add(""Forms.Label.1"", ""lblOBBy"", True): c.Caption = ""Counted By:"": c.Top = 38: c.Left = 8: c.Width = 60"
$f += "    Set c = fr.Controls.Add(""Forms.TextBox.1"", ""txtOBCountedBy"", True): c.Top = 38: c.Left = 72: c.Width = 90"
$f += "    Set c = fr.Controls.Add(""Forms.Label.1"", ""lblOBRem"", True): c.Caption = ""Remarks:"": c.Top = 38: c.Left = 172: c.Width = 60"
$f += "    Set c = fr.Controls.Add(""Forms.TextBox.1"", ""txtOBRemarks"", True): c.Top = 38: c.Left = 244: c.Width = 304"
$f += ""
$f += "    Set btnSaveOB = fr.Controls.Add(""Forms.CommandButton.1"", ""btnSaveOB"", True)"
$f += "    btnSaveOB.Caption = ""Save Opening Balance"": btnSaveOB.Top = 64: btnSaveOB.Left = 354: btnSaveOB.Width = 194: btnSaveOB.Height = 22"
$f += ""
$f += "    ' --- Action buttons ---"
$f += "    y = y + 108"
$f += "    Set btnSaveEdit = Me.Controls.Add(""Forms.CommandButton.1"", ""btnSaveEdit"", True)"
$f += "    btnSaveEdit.Caption = ""Save Changes"": btnSaveEdit.Top = y: btnSaveEdit.Left = 8: btnSaveEdit.Width = 90: btnSaveEdit.Height = 24"
$f += "    Set btnMarkActive = Me.Controls.Add(""Forms.CommandButton.1"", ""btnMarkActive"", True)"
$f += "    btnMarkActive.Caption = ""Mark Active"": btnMarkActive.Top = y: btnMarkActive.Left = 104: btnMarkActive.Width = 90: btnMarkActive.Height = 24"
$f += "    Set btnMarkGhost = Me.Controls.Add(""Forms.CommandButton.1"", ""btnMarkGhost"", True)"
$f += "    btnMarkGhost.Caption = ""Mark Ghost"": btnMarkGhost.Top = y: btnMarkGhost.Left = 200: btnMarkGhost.Width = 90: btnMarkGhost.Height = 24"
$f += "    Set btnDelete = Me.Controls.Add(""Forms.CommandButton.1"", ""btnDelete"", True)"
$f += "    btnDelete.Caption = ""Delete Permanently"": btnDelete.Top = y: btnDelete.Left = 296: btnDelete.Width = 120: btnDelete.Height = 24"
$f += "    Set btnClear = Me.Controls.Add(""Forms.CommandButton.1"", ""btnClear"", True)"
$f += "    btnClear.Caption = ""Clear"": btnClear.Top = y: btnClear.Left = 422: btnClear.Width = 70: btnClear.Height = 24"
$f += "    Set btnClose = Me.Controls.Add(""Forms.CommandButton.1"", ""btnClose"", True)"
$f += "    btnClose.Caption = ""Close"": btnClose.Top = y: btnClose.Left = 498: btnClose.Width = 70: btnClose.Height = 24"
$f += ""
$f += "    ' Defaults"
$f += "    Me.Controls(""txtOBDate"").Value = Format(Date, ""yyyy-mm-dd"")"
$f += "    Me.Controls(""txtOBCountedBy"").Value = Environ(""USERNAME"")"
$f += "    Me.Controls(""cmbStatus"").Value = ""To-Verify"""
$f += "    Me.Controls(""cmbUnit"").Value = ""PCS"""
$f += "    Me.Controls(""txtDBID"").BackColor = RGB(220, 220, 220)"
$f += "End Sub"
$f += ""
$f += "Private Sub AddLabelTextRow(lblName As String, lblText As String, txtName As String, ByVal y As Long, ByVal readOnly As Boolean, Optional ByVal xOffset As Long = 0)"
$f += "    Dim c As Object"
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", lblName, True)"
$f += "    c.Caption = lblText: c.Top = y: c.Left = 8 + xOffset: c.Width = 80"
$f += "    Set c = Me.Controls.Add(""Forms.TextBox.1"", txtName, True)"
$f += "    c.Top = y: c.Left = 92 + xOffset: c.Width = 180"
$f += "    If readOnly Then c.BackColor = RGB(220, 220, 220)"
$f += "End Sub"
$f += ""
$f += "Private Sub AddLabelTextRowWide(lblName As String, lblText As String, txtName As String, ByVal y As Long)"
$f += "    Dim c As Object"
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", lblName, True)"
$f += "    c.Caption = lblText: c.Top = y: c.Left = 8: c.Width = 80"
$f += "    Set c = Me.Controls.Add(""Forms.TextBox.1"", txtName, True)"
$f += "    c.Top = y: c.Left = 92: c.Width = 462"
$f += "End Sub"
$f += ""
$f += "Private Sub AddLabelComboRow(lblName As String, lblText As String, cmbName As String, ByVal y As Long, items As Variant, Optional ByVal xOffset As Long = 0)"
$f += "    Dim c As Object, i As Long"
$f += "    Set c = Me.Controls.Add(""Forms.Label.1"", lblName, True)"
$f += "    c.Caption = lblText: c.Top = y: c.Left = 8 + xOffset: c.Width = 80"
$f += "    Set c = Me.Controls.Add(""Forms.ComboBox.1"", cmbName, True)"
$f += "    c.Top = y: c.Left = 92 + xOffset: c.Width = 180"
$f += "    For i = LBound(items) To UBound(items)"
$f += "        c.AddItem CStr(items(i))"
$f += "    Next i"
$f += "End Sub"
$f += ""
$f += "' ════════════ EVENT HANDLERS ════════════"
$f += ""
$f += "Private Sub btnSearch_Click()"
$f += "    DoSearch"
$f += "End Sub"
$f += ""
$f += "Private Sub txtSearchValue_KeyDown(ByVal KeyCode As MSForms.ReturnInteger, ByVal Shift As Integer)"
$f += "    If KeyCode = 13 Then DoSearch"
$f += "End Sub"
$f += ""
$f += "Private Sub DoSearch()"
$f += "    Dim q As String: q = LCase(Trim(txtSearchValue.Value))"
$f += "    If Len(q) = 0 Then MsgBox ""Enter a search value."", vbInformation: Exit Sub"
$f += "    Dim searchCol As Long"
$f += "    Select Case Me.Controls(""cmbSearchField"").Value"
$f += "        Case ""Item Name"": searchCol = 3"
$f += "        Case ""Internal Code"": searchCol = 2"
$f += "        Case ""DB ID"": searchCol = 1"
$f += "        Case Else: searchCol = 3"
$f += "    End Select"
$f += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$f += "    Dim lastRow As Long: lastRow = RegisterLastRow()"
$f += "    Dim r As Long, hits As Long: hits = 0"
$f += "    lstMatches.Clear"
$f += "    For r = 2 To lastRow"
$f += "        If InStr(LCase(CStr(ws.Cells(r, searchCol).Value)), q) > 0 Then"
$f += "            lstMatches.AddItem CStr(ws.Cells(r, 1).Value)"
$f += "            lstMatches.List(lstMatches.ListCount - 1, 1) = CStr(ws.Cells(r, 2).Value)"
$f += "            lstMatches.List(lstMatches.ListCount - 1, 2) = CStr(ws.Cells(r, 3).Value)"
$f += "            lstMatches.List(lstMatches.ListCount - 1, 3) = CStr(ws.Cells(r, 14).Value)"
$f += "            hits = hits + 1"
$f += "            If hits >= 200 Then Exit For"
$f += "        End If"
$f += "    Next r"
$f += "    If hits = 0 Then"
$f += "        MsgBox ""No matches for: "" & txtSearchValue.Value, vbInformation"
$f += "    ElseIf hits = 1 Then"
$f += "        lstMatches.ListIndex = 0"
$f += "    End If"
$f += "End Sub"
$f += ""
$f += "Private Sub lstMatches_Click()"
$f += "    If lstMatches.ListIndex < 0 Then Exit Sub"
$f += "    LoadProduct CStr(lstMatches.List(lstMatches.ListIndex, 0))"
$f += "End Sub"
$f += ""
$f += "Private Sub LoadProduct(ByVal dbId As String)"
$f += "    Dim r As Long: r = FindRowByDBID(dbId)"
$f += "    If r = 0 Then MsgBox ""Not found: "" & dbId, vbExclamation: Exit Sub"
$f += "    currentRow = r"
$f += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$f += "    Me.Controls(""txtDBID"").Value = NzS(ws.Cells(r, 1).Value)"
$f += "    Me.Controls(""txtCode"").Value = NzS(ws.Cells(r, 2).Value)"
$f += "    Me.Controls(""txtName"").Value = NzS(ws.Cells(r, 3).Value)"
$f += "    Me.Controls(""cmbBrand"").Value = NzS(ws.Cells(r, 4).Value)"
$f += "    Me.Controls(""cmbCategory"").Value = NzS(ws.Cells(r, 5).Value)"
$f += "    Me.Controls(""txtSubCategory"").Value = NzS(ws.Cells(r, 6).Value)"
$f += "    Me.Controls(""txtColor"").Value = NzS(ws.Cells(r, 7).Value)"
$f += "    Me.Controls(""cmbDirection"").Value = NzS(ws.Cells(r, 8).Value)"
$f += "    Me.Controls(""txtMaterial"").Value = NzS(ws.Cells(r, 9).Value)"
$f += "    Me.Controls(""txtPrice"").Value = NzS(ws.Cells(r, 10).Value)"
$f += "    Me.Controls(""cmbUnit"").Value = NzS(ws.Cells(r, 11).Value)"
$f += "    Me.Controls(""txtDesc"").Value = NzS(ws.Cells(r, 12).Value)"
$f += "    Me.Controls(""txtImage"").Value = NzS(ws.Cells(r, 13).Value)"
$f += "    Me.Controls(""cmbStatus"").Value = NzS(ws.Cells(r, 14).Value)"
$f += "    Me.Controls(""txtNotes"").Value = NzS(ws.Cells(r, 20).Value)"
$f += "    Me.Controls(""txtOBQty"").Value = NzS(ws.Cells(r, 15).Value)"
$f += "    If Len(NzS(ws.Cells(r, 16).Value)) > 0 Then"
$f += "        Me.Controls(""txtOBDate"").Value = Format(ws.Cells(r, 16).Value, ""yyyy-mm-dd"")"
$f += "    End If"
$f += "    Me.Controls(""txtOBLocation"").Value = NzS(ws.Cells(r, 17).Value)"
$f += "End Sub"
$f += ""
$f += "Private Function NzS(v As Variant) As String"
$f += "    If IsError(v) Or IsNull(v) Then NzS = """" Else NzS = CStr(v)"
$f += "End Function"
$f += ""
$f += "Private Sub btnSaveEdit_Click()"
$f += "    If currentRow = 0 Then MsgBox ""No product loaded."", vbInformation: Exit Sub"
$f += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$f += "    Dim dbId As String: dbId = CStr(ws.Cells(currentRow, 1).Value)"
$f += "    SetCellIfChanged ws, currentRow, 2, Me.Controls(""txtCode"").Value, dbId, ""Internal_Code"""
$f += "    SetCellIfChanged ws, currentRow, 3, Me.Controls(""txtName"").Value, dbId, ""Item_Name"""
$f += "    SetCellIfChanged ws, currentRow, 4, Me.Controls(""cmbBrand"").Value, dbId, ""Brand"""
$f += "    SetCellIfChanged ws, currentRow, 5, Me.Controls(""cmbCategory"").Value, dbId, ""Category"""
$f += "    SetCellIfChanged ws, currentRow, 6, Me.Controls(""txtSubCategory"").Value, dbId, ""Sub_Category"""
$f += "    SetCellIfChanged ws, currentRow, 7, Me.Controls(""txtColor"").Value, dbId, ""Color"""
$f += "    SetCellIfChanged ws, currentRow, 8, Me.Controls(""cmbDirection"").Value, dbId, ""Direction"""
$f += "    SetCellIfChanged ws, currentRow, 9, Me.Controls(""txtMaterial"").Value, dbId, ""Material"""
$f += "    If IsNumeric(Me.Controls(""txtPrice"").Value) Then"
$f += "        SetCellIfChanged ws, currentRow, 10, CDbl(Me.Controls(""txtPrice"").Value), dbId, ""Unit_Price"""
$f += "    End If"
$f += "    SetCellIfChanged ws, currentRow, 11, Me.Controls(""cmbUnit"").Value, dbId, ""Unit"""
$f += "    SetCellIfChanged ws, currentRow, 12, Me.Controls(""txtDesc"").Value, dbId, ""Description"""
$f += "    SetCellIfChanged ws, currentRow, 13, Me.Controls(""txtImage"").Value, dbId, ""Image_Path"""
$f += "    SetCellIfChanged ws, currentRow, 14, Me.Controls(""cmbStatus"").Value, dbId, ""Status"""
$f += "    SetCellIfChanged ws, currentRow, 20, Me.Controls(""txtNotes"").Value, dbId, ""Notes"""
$f += "    ws.Cells(currentRow, 18).Value = Now"
$f += "    ws.Cells(currentRow, 19).Value = Environ(""USERNAME"")"
$f += "    MsgBox ""Saved: "" & dbId, vbInformation"
$f += "End Sub"
$f += ""
$f += "Private Sub btnSaveOB_Click()"
$f += "    If currentRow = 0 Then MsgBox ""No product loaded."", vbInformation: Exit Sub"
$f += "    Dim obQty As String: obQty = CStr(Me.Controls(""txtOBQty"").Value)"
$f += "    Dim obDate As String: obDate = CStr(Me.Controls(""txtOBDate"").Value)"
$f += "    If Not IsNumeric(obQty) Then MsgBox ""OB Qty must be numeric."", vbExclamation: Exit Sub"
$f += "    If Not IsDate(obDate) Then MsgBox ""Count Date invalid (use YYYY-MM-DD)."", vbExclamation: Exit Sub"
$f += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$f += "    Dim wob As Worksheet: Set wob = ThisWorkbook.Worksheets(SH_OB)"
$f += "    Dim r As Long: r = wob.Cells(wob.Rows.Count, 1).End(xlUp).Row + 1"
$f += "    If r < 2 Then r = 2"
$f += "    Dim ref As String: ref = NextOBRef()"
$f += "    Dim dbId As String: dbId = CStr(ws.Cells(currentRow, 1).Value)"
$f += "    wob.Cells(r, 1).Value = ref"
$f += "    wob.Cells(r, 2).Value = CDate(obDate)"
$f += "    wob.Cells(r, 3).Value = dbId"
$f += "    wob.Cells(r, 4).Value = CStr(ws.Cells(currentRow, 3).Value)"
$f += "    wob.Cells(r, 5).Value = CDbl(obQty)"
$f += "    wob.Cells(r, 6).Value = Me.Controls(""cmbUnit"").Value"
$f += "    wob.Cells(r, 7).Value = Me.Controls(""txtOBLocation"").Value"
$f += "    wob.Cells(r, 8).Value = Me.Controls(""txtOBCountedBy"").Value"
$f += "    wob.Cells(r, 9).Value = Me.Controls(""txtOBRemarks"").Value"
$f += "    wob.Cells(r, 10).Value = Now"
$f += "    wob.Cells(r, 11).Value = Environ(""USERNAME"")"
$f += "    ws.Cells(currentRow, 15).Value = CDbl(obQty)"
$f += "    ws.Cells(currentRow, 16).Value = CDate(obDate)"
$f += "    ws.Cells(currentRow, 17).Value = Me.Controls(""txtOBLocation"").Value"
$f += "    If LCase(CStr(ws.Cells(currentRow, 14).Value)) = ""to-verify"" Then"
$f += "        Dim oldS As String: oldS = CStr(ws.Cells(currentRow, 14).Value)"
$f += "        ws.Cells(currentRow, 14).Value = ""Active"""
$f += "        Me.Controls(""cmbStatus"").Value = ""Active"""
$f += "        WriteLog dbId, ""AUTO-STATUS"", ""Status"", oldS, ""Active"""
$f += "    End If"
$f += "    ws.Cells(currentRow, 18).Value = Now"
$f += "    ws.Cells(currentRow, 19).Value = Environ(""USERNAME"")"
$f += "    WriteLog dbId, ""OB-ENTRY"", ""OB_Qty"", """", obQty"
$f += "    MsgBox ""Saved: "" & ref & vbCrLf & ""Qty: "" & obQty, vbInformation"
$f += "End Sub"
$f += ""
$f += "Private Sub btnMarkGhost_Click()"
$f += "    If currentRow = 0 Then MsgBox ""No product loaded."", vbInformation: Exit Sub"
$f += "    If MsgBox(""Mark as GHOST?"" & vbCrLf & Me.Controls(""txtDBID"").Value & "" | "" & Me.Controls(""txtName"").Value, vbYesNo + vbQuestion) <> vbYes Then Exit Sub"
$f += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$f += "    Dim dbId As String: dbId = CStr(ws.Cells(currentRow, 1).Value)"
$f += "    Dim oldS As String: oldS = CStr(ws.Cells(currentRow, 14).Value)"
$f += "    ws.Cells(currentRow, 14).Value = ""Ghost"""
$f += "    ws.Cells(currentRow, 18).Value = Now"
$f += "    ws.Cells(currentRow, 19).Value = Environ(""USERNAME"")"
$f += "    Me.Controls(""cmbStatus"").Value = ""Ghost"""
$f += "    WriteLog dbId, ""GHOST"", ""Status"", oldS, ""Ghost"""
$f += "    MsgBox ""Marked Ghost: "" & dbId, vbInformation"
$f += "End Sub"
$f += ""
$f += "Private Sub btnMarkActive_Click()"
$f += "    If currentRow = 0 Then MsgBox ""No product loaded."", vbInformation: Exit Sub"
$f += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$f += "    Dim dbId As String: dbId = CStr(ws.Cells(currentRow, 1).Value)"
$f += "    Dim oldS As String: oldS = CStr(ws.Cells(currentRow, 14).Value)"
$f += "    ws.Cells(currentRow, 14).Value = ""Active"""
$f += "    ws.Cells(currentRow, 18).Value = Now"
$f += "    ws.Cells(currentRow, 19).Value = Environ(""USERNAME"")"
$f += "    Me.Controls(""cmbStatus"").Value = ""Active"""
$f += "    WriteLog dbId, ""EDIT"", ""Status"", oldS, ""Active"""
$f += "End Sub"
$f += ""
$f += "Private Sub btnDelete_Click()"
$f += "    If currentRow = 0 Then MsgBox ""No product loaded."", vbInformation: Exit Sub"
$f += "    If MsgBox(""PERMANENTLY DELETE row? Cannot undo."" & vbCrLf & Me.Controls(""txtDBID"").Value, vbYesNo + vbCritical + vbDefaultButton2, ""Delete 1/2"") <> vbYes Then Exit Sub"
$f += "    If MsgBox(""FINAL CONFIRM: Delete "" & Me.Controls(""txtDBID"").Value & ""?"", vbYesNo + vbCritical + vbDefaultButton2, ""Delete 2/2"") <> vbYes Then Exit Sub"
$f += "    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets(SH_REGISTER)"
$f += "    Dim dbId As String: dbId = CStr(ws.Cells(currentRow, 1).Value)"
$f += "    WriteLog dbId, ""DELETE"", ""Row"", ""EXISTED"", ""DELETED"""
$f += "    ws.Rows(currentRow).Delete"
$f += "    ClearForm"
$f += "    MsgBox ""Deleted: "" & dbId, vbInformation"
$f += "End Sub"
$f += ""
$f += "Private Sub btnClear_Click()"
$f += "    ClearForm"
$f += "End Sub"
$f += ""
$f += "Private Sub btnClose_Click()"
$f += "    Unload Me"
$f += "End Sub"
$f += ""
$f += "Private Sub ClearForm()"
$f += "    currentRow = 0"
$f += "    Dim names As Variant"
$f += "    names = Array(""txtDBID"", ""txtCode"", ""txtName"", ""cmbBrand"", ""cmbCategory"", ""txtSubCategory"", ""txtColor"", ""cmbDirection"", ""txtMaterial"", ""txtPrice"", ""txtDesc"", ""txtImage"", ""txtNotes"", ""txtOBQty"", ""txtOBLocation"", ""txtOBRemarks"")"
$f += "    Dim i As Long"
$f += "    For i = LBound(names) To UBound(names)"
$f += "        Me.Controls(CStr(names(i))).Value = """""
$f += "    Next i"
$f += "    Me.Controls(""cmbStatus"").Value = ""To-Verify"""
$f += "    Me.Controls(""cmbUnit"").Value = ""PCS"""
$f += "    Me.Controls(""txtOBDate"").Value = Format(Date, ""yyyy-mm-dd"")"
$f += "    txtSearchValue.Value = """""
$f += "    lstMatches.Clear"
$f += "End Sub"

$frm.CodeModule.AddFromString(($f -join "`r`n"))

Write-Host "Saving final workbook..."
$wb.Save()
$wb.Close($true)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Host ""
Write-Host "DONE."
Write-Host "File: $OUTPUT_PATH"
Write-Host "Products in Register: $lastDataRow"
