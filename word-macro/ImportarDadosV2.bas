Attribute VB_Name = "ImportarDadosV2"
' ============================================================================
' ImportarDadosV2.bas
' ----------------------------------------------------------------------------
' CHANGELOG desta revisão:
' - SetBookmarkText agora reporta em uma única MsgBox ao final quais
'   bookmarks não foram encontrados, em vez de silenciar tudo com
'   "On Error Resume Next" e só logar no Immediate Window (Debug.Print),
'   que o usuário final nunca vê. Isso ajuda a perceber rapidamente quando
'   o template do Word está desatualizado em relação ao script.
' - Pequena validação: se o clipboard estiver vazio ou sem "=", avisa o
'   usuário em vez de seguir silenciosamente com campos em branco.
' - Comentários indicando onde plugar os campos extras já mapeados no
'   carta_proposta.user.js (o script hoje só envia titulo, contratado,
'   datas, total, parcelas — mas os formatos já preveem campos como
'   quadro2_PF, ecad, vinculo, sbat, drt, autoria_danca, seguro, art).
' ============================================================================

Private erros As String

Public Sub FromClipboard()
    On Error GoTo ErrorHandler

    Dim texto As String
    Dim dataObj As New MSForms.DataObject

    dataObj.GetFromClipboard
    texto = dataObj.GetText()
    Debug.Print "Text saved from Clipboard: '" & texto & "'"

    If texto = "" Or InStr(texto, "=") = 0 Then
        MsgBox "O clipboard não contém dados no formato esperado (ex: titulo=...|contratado=...).", _
               vbExclamation, "Dados inválidos"
        Exit Sub
    End If

    Dim titulo As String
    Dim contratado As String
    Dim datas As String
    Dim total As String
    Dim parcelas As String

    Call ParseClipboardData(texto, titulo, contratado, datas, total, parcelas)

    Dim formato As String
    formato = GetFormatoSelecionado()
    If formato = "" Then Exit Sub

    erros = ""
    Call ConfigurarDocumento(formato, titulo, contratado, datas, total, parcelas)

    If erros <> "" Then
        MsgBox "Alguns campos não foram encontrados no template (bookmarks ausentes):" & _
               vbNewLine & vbNewLine & erros, vbExclamation, "Aviso"
    End If

    Exit Sub

ErrorHandler:
    MsgBox "Erro " & Err.Number & ": " & Err.Description, vbCritical, "Erro"
End Sub

Private Sub ParseClipboardData(texto As String, ByRef titulo As String, ByRef contratado As String, _
                                ByRef datas As String, ByRef total As String, ByRef parcelas As String)

    Dim pares As Variant
    Dim par As Variant
    Dim partes() As String
    Dim nome As String
    Dim valor As String

    pares = Split(texto, "|")

    For Each par In pares
        If InStr(par, "=") > 0 Then
            partes = Split(par, "=")
            If UBound(partes) >= 1 Then
                nome = Trim(partes(0))
                valor = Trim(partes(1))

                Select Case nome
                    Case "titulo"
                        titulo = valor
                    Case "contratado"
                        contratado = valor
                    Case "datas"
                        datas = valor
                    Case "total"
                        total = valor
                    Case "parcelas"
                        parcelas = valor
                    ' PRÓXIMO PASSO (ver carta_proposta.user.js / MELHORAR):
                    ' quando o userscript passar a enviar campos extras
                    ' (ecad, vinculo, sbat, drt, autoria_danca, seguro, art),
                    ' adicionar um Case para cada um aqui, com as variáveis
                    ' ByRef correspondentes.
                End Select
            End If
        End If
    Next par
End Sub

Private Function GetFormatoSelecionado() As String
    Const PROMPT As String = "Escolha um tipo de carta:" & vbNewLine & _
                            "0. PF" & vbNewLine & _
                            "1. oficina" & vbNewLine & _
                            "2. dança" & vbNewLine & _
                            "3. intervencao / narração / esportiva" & vbNewLine & _
                            "4. musica" & vbNewLine & _
                            "5. circo" & vbNewLine & _
                            "6. teatro"

    Dim result As Variant
    Dim formatos As Variant

    formatos = Array("PF", "oficina", "danca", "intervencao", "musica", "circo", "teatro")

    Do
        result = InputBox(PROMPT, "Digitar número", "0")
        If result = "" Then Exit Function

        If IsNumeric(result) And result >= 0 And result <= 6 Then
            GetFormatoSelecionado = formatos(CInt(result))
            Exit Do
        End If

        MsgBox "Por favor, digite um número entre 0 e 6.", vbExclamation
    Loop
End Function

Private Sub ConfigurarDocumento(formato As String, titulo As String, contratado As String, _
                                 datas As String, total As String, parcelas As String)

    Call ConfigurarFormatoTexto(formato)
    Call ApagarBookmarksPorFormato(formato)
    Call InserirDadosCabecalho(formato, titulo, contratado, datas, total, parcelas)
End Sub

Private Sub ConfigurarFormatoTexto(formato As String)
    Dim textoFormato As String

    Select Case formato
        Case "oficina"
            textoFormato = "oficina de"
        Case "danca"
            textoFormato = "apresentação de dança"
        Case "intervencao"
            textoFormato = "intervenção"
        Case "musica"
            textoFormato = "apresentação de música"
        Case "circo"
            textoFormato = "apresentação de circo"
        Case "teatro"
            textoFormato = "apresentação de teatro"
        Case Else
            Exit Sub
    End Select

    Call SetBookmarkText("formato", textoFormato)
    Call SetBookmarkText("formato2", textoFormato)
End Sub

Private Sub ApagarBookmarksPorFormato(formato As String)
    Dim allDocuments() As String
    Dim oneDocument() As String
    Dim i As Long
    Dim j As Long
    Dim encontrado As Boolean

    allDocuments = Split("ecad, vinculo, sbat, drt, autoria_danca, seguro, art", ", ")

    Select Case formato
        Case "PF"
            Call SetBookmarkText("quadro2_PJ", "")
            Call SetBookmarkText("quadro3_PJ", "")
            Call SetBookmarkText("quadro_representante_PJ", "")
            Exit Sub

        Case "circo"
            oneDocument = Split("ecad,vinculo,drt,seguro,art", ",")
        Case "danca"
            oneDocument = Split("ecad,vinculo,drt,autoria_danca", ",")
        Case "intervencao"
            oneDocument = Split("ecad,vinculo", ",")
        Case "musica"
            oneDocument = Split("ecad,vinculo", ",")
        Case "oficina"
            oneDocument = Split("vinculo", ",")
        Case "teatro"
            oneDocument = Split("ecad,sbat,vinculo,drt", ",")
        Case Else
            Exit Sub
    End Select

    For i = LBound(allDocuments) To UBound(allDocuments)
        encontrado = False
        For j = LBound(oneDocument) To UBound(oneDocument)
            If Trim(allDocuments(i)) = Trim(oneDocument(j)) Then
                encontrado = True
                Exit For
            End If
        Next j
        If Not encontrado Then
            Call SetBookmarkText(Trim(allDocuments(i)), "")
        End If
    Next i

    Call SetBookmarkText("quadro2_PF", "")
    Call SetBookmarkText("quadro3_PF", "")
End Sub

Private Sub InserirDadosCabecalho(formato As String, titulo As String, contratado As String, _
                                   datas As String, total As String, parcelas As String)

    If formato <> "musica" Then
        Call SetBookmarkText("titulo_acao", titulo)
        Call SetBookmarkText("contratado", contratado)
    Else
        Call SetBookmarkText("titulo_acao", contratado)
        Call SetBookmarkText("contratado", titulo)
        Call SetBookmarkText("hifen", " - ")
    End If

    Call SetBookmarkText("horarios", datas)
    Call SetBookmarkText("total", total)
    Call SetBookmarkText("parcelas", parcelas)

    Call SetBookmarkText("titulo_vinculo", titulo)
    Call SetBookmarkText("datas_vinculo", datas)

    If parcelas = "" Then
        Call SetBookmarkText("intro_parcelas", "")
    End If
End Sub

Private Sub SetBookmarkText(bookmarkName As String, textValue As String)
    If ActiveDocument.Bookmarks.Exists(bookmarkName) Then
        ActiveDocument.Bookmarks(bookmarkName).Range.Text = textValue
    Else
        Debug.Print "Bookmark não encontrado: " & bookmarkName
        erros = erros & "- " & bookmarkName & vbNewLine
    End If
End Sub
