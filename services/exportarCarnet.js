
const PDFDocument = require("pdfkit");

function formatearFecha(valor) {
    if (!valor) return "No registrada";

    const fecha = valor instanceof Date
        ? valor.toISOString().slice(0, 10)
        : String(valor).slice(0, 10);

    const partes = fecha.split("-");

    if (partes.length !== 3) return "No registrada";

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function generarCarnetPDF(res, datos) {
    const { nino, responsable, vacunacion } = datos;

    const documento = new PDFDocument({
        size: "A4",
        margin: 40,
        bufferPages: true
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="carnet-infantil-${nino.id_nino}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store");

    documento.pipe(res);

    const margen = 40;
    const ancho = documento.page.width - 80;

    // ENCABEZADO
    documento.rect(0, 0, documento.page.width, 90)
        .fill("#174A7E");

    documento.fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(19)
        .text("SCCVI", margen, 25);

    documento.font("Helvetica")
        .fontSize(12)
        .text("Carnet Digital de Vacunación Infantil", margen, 53);

    documento.fillColor("#222222");

    // INFORMACIÓN DEL NIÑO
    let y = 115;

    documento.font("Helvetica-Bold")
        .fontSize(13)
        .text("Información del niño", margen, y);

    y += 28;

    const nombre = `${nino.nombres} ${nino.apellidos}`;

    const campos = [
        ["Nombre completo", nombre],
        ["Fecha de nacimiento", formatearFecha(nino.fecha_nacimiento)],
        ["Sexo", nino.sexo === "M" ? "Masculino" : "Femenino"],
        ["Comunidad", nino.comunidad],
        [
            "Responsable principal",
            responsable
                ? `${responsable.nombres} ${responsable.apellidos}`
                : "No registrado"
        ]
    ];

    campos.forEach(([etiqueta, valor]) => {
        documento.font("Helvetica-Bold")
            .fontSize(10)
            .text(`${etiqueta}:`, margen, y, {
                width: 145
            });

        documento.font("Helvetica")
            .text(String(valor), margen + 150, y, {
                width: ancho - 150
            });

        y = Math.max(y + 25, documento.y + 7);
    });

    // RESUMEN
    y += 15;

    const aplicadas = vacunacion.filter(
        v => v.estado === "aplicada"
    ).length;

    const pendientes = vacunacion.filter(
        v => v.estado === "pendiente"
    ).length;

    const programadas = vacunacion.filter(
        v => v.estado === "programada"
    ).length;

    documento.font("Helvetica-Bold")
        .fontSize(13)
        .text("Resumen de vacunación", margen, y);

    y += 27;

    documento.font("Helvetica")
        .fontSize(10)
        .text(
            `Aplicadas: ${aplicadas}     Pendientes: ${pendientes}     Programadas: ${programadas}`,
            margen,
            y
        );

    y += 35;

    // HISTORIAL
    documento.font("Helvetica-Bold")
        .fontSize(13)
        .text("Esquema de vacunación", margen, y);

    y += 27;

    const columnas = [
        { titulo: "Vacuna", ancho: 155 },
        { titulo: "Dosis", ancho: 50 },
        { titulo: "Recomendada", ancho: 105 },
        { titulo: "Aplicada", ancho: 105 },
        { titulo: "Estado", ancho: ancho - 415 }
    ];

    function dibujarFila(valores, encabezado = false) {
        documento.font(
            encabezado ? "Helvetica-Bold" : "Helvetica"
        ).fontSize(8);

        const altura = Math.max(
            25,
            ...valores.map((valor, indice) =>
                documento.heightOfString(String(valor), {
                    width: columnas[indice].ancho - 10
                }) + 12
            )
        );

        if (y + altura > documento.page.height - 55) {
            documento.addPage();
            y = 45;

            if (!encabezado) {
                dibujarFila(columnas.map(c => c.titulo), true);
            }
        }

        let x = margen;

        valores.forEach((valor, indice) => {
            documento.save();

            documento.rect(
                x,
                y,
                columnas[indice].ancho,
                altura
            ).fill(encabezado ? "#E9EEF5" : "#FFFFFF");

            documento.restore();

            documento.fillColor("#222222")
                .font(encabezado ? "Helvetica-Bold" : "Helvetica")
                .fontSize(8)
                .text(String(valor), x + 5, y + 6, {
                    width: columnas[indice].ancho - 10,
                    lineBreak: false
                });

            x += columnas[indice].ancho;
        });

        y += altura;
    }

    dibujarFila(columnas.map(c => c.titulo), true);

    vacunacion.forEach(vacuna => {
        const estados = {
            aplicada: "Aplicada",
            pendiente: "Pendiente",
            programada: "Programada"
        };

        dibujarFila([
            vacuna.vacuna,
            vacuna.numero_dosis,
            formatearFecha(vacuna.fecha_recomendada),
            formatearFecha(vacuna.fecha_aplicacion),
            estados[vacuna.estado] || "Sin definir"
        ]);
    });

    if (!vacunacion.length) {
        documento.font("Helvetica")
            .fontSize(10)
            .text("No hay vacunas en el esquema.", margen, y + 10);
    }

    // PIE DE PÁGINA
    const paginas = documento.bufferedPageRange();

    for (let i = 0; i < paginas.count; i++) {
        documento.switchToPage(i);

        documento.font("Helvetica")
            .fontSize(8)
            .fillColor("#666666")
            .text(
                `SCCVI | Generado: ${new Date().toLocaleDateString("es-GT", {
                    timeZone: "America/Guatemala"
                })} | Página ${i + 1} de ${paginas.count}`,
                margen,
                documento.page.height - 35,
                {
                    width: ancho,
                    align: "center",
                    lineBreak: false
                }
            );
    }

    documento.end();
}

module.exports = { generarCarnetPDF };
