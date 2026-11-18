
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

const configuraciones = {
    ninos: {
        titulo: "Niños registrados por comunidad",
        columnas: [
            ["comunidad", "Comunidad"],
            ["total_ninos", "Total de niños"],
            ["masculinos", "Masculino"],
            ["femeninos", "Femenino"]
        ]
    },
    vacunacion: {
        titulo: "Dosis aplicadas por vacuna",
        columnas: [
            ["vacuna", "Vacuna"],
            ["dosis_aplicadas", "Dosis aplicadas"]
        ]
    },
   
alertas: {
    titulo: "Alertas por estado",
    columnas: [
        ["estado", "Estado"],
        ["total", "Cantidad"]
    ]
},

"cumplimiento-vacunacion": {
    titulo: "Cumplimiento del esquema de vacunación",
    columnas: [
        ["concepto", "Indicador"],
        ["cantidad", "Cantidad"]
    ]
}



};

const nombresEstados = {
    pendiente: "Pendiente",
    en_seguimiento: "En seguimiento",
    atendida: "Atendida",
    cerrada: "Cerrada"
};

function prepararReporte(tipo, registros, filtros) {
    const configuracion = configuraciones[tipo];

    if (!configuracion) {
        throw new Error("Tipo de reporte no válido");
    }

    const filas = registros.map(registro =>
        configuracion.columnas.map(([campo]) => {
            const valor = registro[campo] ?? "-";

            return campo === "estado"
                ? nombresEstados[valor] || valor
                : valor;
        })
    );

    return {
        titulo: configuracion.titulo,
        encabezados: configuracion.columnas.map(
            ([, titulo]) => titulo
        ),
        filas,
        filtros
    };
}

function exportarPDF(res, reporte) {
    const documento = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 40
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        'attachment; filename="reporte-sccvi.pdf"'
    );

    documento.pipe(res);

    documento.fontSize(18)
        .font("Helvetica-Bold")
        .text("SCCVI - Reporte General");

    documento.moveDown(0.5);

    documento.fontSize(13)
        .text(reporte.titulo);

    documento.moveDown(0.5);

    documento.font("Helvetica")
        .fontSize(9)
        .text(`Generado: ${new Date().toLocaleString("es-GT", {
            timeZone: "America/Guatemala"
        })}`)
        .text(`Comunidad: ${reporte.filtros.comunidad}`)
        .text(`Fecha inicial: ${reporte.filtros.inicio}`)
        .text(`Fecha final: ${reporte.filtros.fin}`);

    documento.moveDown();

    const anchoDisponible =
        documento.page.width -
        documento.page.margins.left -
        documento.page.margins.right;

    const anchoColumna =
        anchoDisponible / reporte.encabezados.length;

    const altoFila = 25;
    const margenInferior = documento.page.height -
        documento.page.margins.bottom;

    function dibujarFila(valores, encabezado = false) {
        const alturaNecesaria = Math.max(
            altoFila,
            ...valores.map(valor =>
                documento.heightOfString(String(valor), {
                    width: anchoColumna - 12,
                    align: "left"
                }) + 12
            )
        );

        if (documento.y + alturaNecesaria > margenInferior) {
            documento.addPage();
            if (!encabezado) dibujarFila(reporte.encabezados, true);
        }

        const y = documento.y;

        valores.forEach((valor, indice) => {
            const x = documento.page.margins.left +
                indice * anchoColumna;

            documento.save();

            documento.rect(
                x,
                y,
                anchoColumna,
                alturaNecesaria
            ).fill(encabezado ? "#E9EEF5" : "#FFFFFF");

            documento.restore();

            documento.font(
                encabezado ? "Helvetica-Bold" : "Helvetica"
            ).fontSize(9).fillColor("#222222");

            documento.text(String(valor), x + 6, y + 6, {
                width: anchoColumna - 12,
                lineBreak: false
            });
        });

        documento.y = y + alturaNecesaria;
    }

    dibujarFila(reporte.encabezados, true);

    reporte.filas.forEach(fila => {
        dibujarFila(fila);
    });

    if (!reporte.filas.length) {
        documento.moveDown();
        documento.text("No existen registros para los filtros seleccionados.");
    }

    documento.end();
}

async function exportarExcel(res, reporte) {
    const libro = new ExcelJS.Workbook();

    libro.creator = "SCCVI";
    libro.created = new Date();

    const hoja = libro.addWorksheet("Reporte");

    hoja.addRow(["SCCVI - Reporte General"]);
    hoja.addRow([reporte.titulo]);
    hoja.addRow([
        "Generado",
        new Date().toLocaleString("es-GT", {
            timeZone: "America/Guatemala"
        })
    ]);
    hoja.addRow(["Comunidad", reporte.filtros.comunidad]);
    hoja.addRow(["Fecha inicial", reporte.filtros.inicio]);
    hoja.addRow(["Fecha final", reporte.filtros.fin]);
    hoja.addRow([]);

    const filaEncabezado = hoja.addRow(reporte.encabezados);

    filaEncabezado.font = {
        bold: true,
        color: { argb: "FFFFFFFF" }
    };

    filaEncabezado.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF174A7E" }
    };

    reporte.filas.forEach(fila => {
        hoja.addRow(fila);
    });

    hoja.columns.forEach(columna => {
        columna.width = 25;
    });

    hoja.views = [{
        state: "frozen",
        ySplit: 8
    }];

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
        "Content-Disposition",
        'attachment; filename="reporte-sccvi.xlsx"'
    );

    await libro.xlsx.write(res);
    res.end();
}

module.exports = {
    configuraciones,
    prepararReporte,
    exportarPDF,
    exportarExcel
};
