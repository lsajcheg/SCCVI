
const express = require("express");
const router = express.Router();

const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// ==========================================
// SEGURIDAD
// ==========================================
router.use(requiereAutenticacion);

const puedeExportar = requiereRol(
    "administrador",
    "medico",
    "enfermero"
);

const {
    configuraciones,
    prepararReporte,
    exportarPDF,
    exportarExcel
} = require("../services/exportarReportes");


// ==========================================
// VALIDAR FILTROS
// ==========================================
function obtenerFiltros(req, res, next) {
    const {
        id_comunidad = "",
        fecha_inicio = "",
        fecha_fin = ""
    } = req.query;

    const comunidad = id_comunidad === ""
        ? null
        : Number(id_comunidad);

    const formatoFecha = /^\d{4}-\d{2}-\d{2}$/;

    const fechaValida = fecha => {
        if (!formatoFecha.test(fecha)) return false;

        const fechaObjeto = new Date(`${fecha}T00:00:00Z`);

        return !Number.isNaN(fechaObjeto.getTime()) &&
            fechaObjeto.toISOString().slice(0, 10) === fecha;
    };

    if (
        comunidad !== null &&
        (!Number.isSafeInteger(comunidad) || comunidad <= 0)
    ) {
        return res.status(400).json({
            error: "Comunidad inválida"
        });
    }

    if (
        (fecha_inicio && !fechaValida(fecha_inicio)) ||
        (fecha_fin && !fechaValida(fecha_fin))
    ) {
        return res.status(400).json({
            error: "Formato de fecha inválido"
        });
    }

    if (
        fecha_inicio &&
        fecha_fin &&
        fecha_inicio > fecha_fin
    ) {
        return res.status(400).json({
            error: "La fecha inicial no puede superar la fecha final"
        });
    }

    req.filtrosReportes = {
        comunidad,
        fechaInicio: fecha_inicio || null,
        fechaFin: fecha_fin || null
    };

    next();
}

// ==========================================
// LISTAR COMUNIDADES
// ==========================================
router.get("/comunidades", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                id_comunidad,
                nombre
            FROM comunidades
            ORDER BY nombre ASC
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR COMUNIDADES REPORTES:", error);

        res.status(500).json({
            error: "Error al consultar comunidades"
        });
    }
});

// ==========================================
// INDICADORES GENERALES
// ==========================================
router.get("/indicadores", obtenerFiltros, async (req, res) => {
    const {
        comunidad,
        fechaInicio,
        fechaFin
    } = req.filtrosReportes;

    const parametros = [
        comunidad,
        fechaInicio,
        fechaFin
    ];

    try {
        const resultado = await pool.query(`
            SELECT
                (
                    SELECT COUNT(*)::integer
                    FROM ninos n
                    WHERE ($1::integer IS NULL
                           OR n.id_comunidad = $1)
                      AND ($2::date IS NULL
                           OR n.fecha_registro >= $2::date)
                      AND ($3::date IS NULL
                           OR n.fecha_registro < ($3::date + 1))
                ) AS total_ninos,

                (
                    SELECT COUNT(*)::integer
                    FROM registros_vacunacion rv
                    INNER JOIN ninos n
                        ON n.id_nino = rv.id_nino
                    WHERE ($1::integer IS NULL
                           OR n.id_comunidad = $1)
                      AND ($2::date IS NULL
                           OR rv.fecha_aplicacion >= $2::date)
                      AND ($3::date IS NULL
                           OR rv.fecha_aplicacion <= $3::date)
                ) AS dosis_aplicadas,

                (
                    SELECT COUNT(*)::integer
                    FROM alertas a
                    INNER JOIN ninos n
                        ON n.id_nino = a.id_nino
                    WHERE a.estado = 'pendiente'
                      AND ($1::integer IS NULL
                           OR n.id_comunidad = $1)
                      AND ($2::date IS NULL
                           OR a.fecha_alerta >= $2::date)
                      AND ($3::date IS NULL
                           OR a.fecha_alerta < ($3::date + 1))
                ) AS alertas_pendientes,

                (
                    SELECT COUNT(*)::integer
                    FROM comunidades c
                    WHERE ($1::integer IS NULL
                           OR c.id_comunidad = $1)
                ) AS total_comunidades
        `, parametros);

        res.json(resultado.rows[0]);

    } catch (error) {
        console.error("ERROR INDICADORES REPORTES:", error);

        res.status(500).json({
            error: "Error al consultar indicadores"
        });
    }
});

// ==========================================
// REPORTE DE NIÑOS POR COMUNIDAD
// ==========================================
router.get("/ninos", obtenerFiltros, async (req, res) => {
    const {
        comunidad,
        fechaInicio,
        fechaFin
    } = req.filtrosReportes;

    try {
        const resultado = await pool.query(`
            SELECT
                c.id_comunidad,
                c.nombre AS comunidad,
                COUNT(n.id_nino)::integer AS total_ninos,

                COUNT(n.id_nino) FILTER (
                    WHERE LOWER(TRIM(n.sexo)) IN
                        ('masculino', 'm')
                )::integer AS masculinos,

                COUNT(n.id_nino) FILTER (
                    WHERE LOWER(TRIM(n.sexo)) IN
                        ('femenino', 'f')
                )::integer AS femeninos

            FROM comunidades c

            LEFT JOIN ninos n
                ON n.id_comunidad = c.id_comunidad
               AND ($2::date IS NULL
                    OR n.fecha_registro >= $2::date)
               AND ($3::date IS NULL
                    OR n.fecha_registro < ($3::date + 1))

            WHERE ($1::integer IS NULL
                   OR c.id_comunidad = $1)

            GROUP BY
                c.id_comunidad,
                c.nombre

            ORDER BY c.nombre ASC
        `, [comunidad, fechaInicio, fechaFin]);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR REPORTE NIÑOS:", error);

        res.status(500).json({
            error: "Error al consultar reporte de niños"
        });
    }
});

// ==========================================
// REPORTE DE DOSIS APLICADAS POR VACUNA
// ==========================================
router.get("/vacunacion", obtenerFiltros, async (req, res) => {
    const {
        comunidad,
        fechaInicio,
        fechaFin
    } = req.filtrosReportes;

    try {
        const resultado = await pool.query(`
            SELECT
                v.id_vacuna,
                v.nombre AS vacuna,
                COUNT(rv.id_registro_vacuna)::integer
                    AS dosis_aplicadas

            FROM vacunas v

            LEFT JOIN esquema_vacunacion e
                ON e.id_vacuna = v.id_vacuna

            LEFT JOIN registros_vacunacion rv
                ON rv.id_esquema = e.id_esquema
               AND ($2::date IS NULL
                    OR rv.fecha_aplicacion >= $2::date)
               AND ($3::date IS NULL
                    OR rv.fecha_aplicacion <= $3::date)
               AND (
                    $1::integer IS NULL
                    OR EXISTS (
                        SELECT 1
                        FROM ninos n
                        WHERE n.id_nino = rv.id_nino
                          AND n.id_comunidad = $1
                    )
               )

            GROUP BY
                v.id_vacuna,
                v.nombre

            ORDER BY v.nombre ASC
        `, [comunidad, fechaInicio, fechaFin]);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR REPORTE VACUNACIÓN:", error);

        res.status(500).json({
            error: "Error al consultar reporte de vacunación"
        });
    }
});

// ==========================================
// REPORTE DE ALERTAS POR ESTADO
// ==========================================
router.get("/alertas", obtenerFiltros, async (req, res) => {
    const {
        comunidad,
        fechaInicio,
        fechaFin
    } = req.filtrosReportes;

    try {
        const resultado = await pool.query(`
            SELECT
                a.estado,
                COUNT(*)::integer AS total

            FROM alertas a

            INNER JOIN ninos n
                ON n.id_nino = a.id_nino

            WHERE ($1::integer IS NULL
                   OR n.id_comunidad = $1)
              AND ($2::date IS NULL
                   OR a.fecha_alerta >= $2::date)
              AND ($3::date IS NULL
                   OR a.fecha_alerta < ($3::date + 1))

            GROUP BY a.estado

            ORDER BY a.estado ASC
        `, [comunidad, fechaInicio, fechaFin]);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR REPORTE ALERTAS:", error);

        res.status(500).json({
            error: "Error al consultar reporte de alertas"
        });
    }
});


 // ==========================================
 // CUMPLIMIENTO DEL ESQUEMA DE VACUNACIÓN
 // ==========================================
 router.get(
     "/cumplimiento-vacunacion",
     obtenerFiltros,
     async (req, res) => {
         try {
             const {
                 comunidad,
                 fechaInicio,
                 fechaFin
             } = req.filtrosReportes;

             const resultado = await pool.query(`
                 WITH seguimiento AS (
                     SELECT
                         n.id_nino,
                         e.id_esquema,

                         (
                             n.fecha_nacimiento
                             + make_interval(
                                 months => e.edad_recomendada_meses
                             )
                         )::date AS fecha_recomendada,

                         EXISTS (
                             SELECT 1
                             FROM registros_vacunacion r
                             WHERE r.id_nino = n.id_nino
                               AND r.id_esquema = e.id_esquema
                         ) AS aplicada

                     FROM ninos n

                     CROSS JOIN esquema_vacunacion e

                     INNER JOIN vacunas v
                         ON v.id_vacuna = e.id_vacuna

                     WHERE v.estado = TRUE
                       AND (
                           $1::integer IS NULL
                           OR n.id_comunidad = $1
                       )
                 )

                 SELECT
                     COUNT(*) FILTER (
                         WHERE aplicada
                           AND fecha_recomendada <= CURRENT_DATE
                     )::integer AS dosis_aplicadas,

                     COUNT(*) FILTER (
                         WHERE NOT aplicada
                           AND fecha_recomendada <= CURRENT_DATE
                     )::integer AS dosis_pendientes,

                     COUNT(*) FILTER (
                         WHERE NOT aplicada
                           AND fecha_recomendada > CURRENT_DATE
                           AND fecha_recomendada <= CURRENT_DATE + 30
                     )::integer AS proximas_dosis,

                     COUNT(*) FILTER (
                         WHERE fecha_recomendada <= CURRENT_DATE
                     )::integer AS dosis_esperadas

                 FROM seguimiento

                 WHERE (
                     $2::date IS NULL
                     OR fecha_recomendada >= $2::date
                 )
                 AND (
                     $3::date IS NULL
                     OR fecha_recomendada <= $3::date
                 )
             `, [
                 comunidad,
                 fechaInicio,
                 fechaFin
             ]);

             const datos = resultado.rows[0];

             const porcentaje =
                 datos.dosis_esperadas > 0
                     ? Number((
                         datos.dosis_aplicadas /
                         datos.dosis_esperadas * 100
                     ).toFixed(2))
                     : 0;

             res.json({
                 ...datos,
                 porcentaje_cumplimiento: porcentaje
             });

         } catch (error) {
             console.error(
                 "ERROR CUMPLIMIENTO VACUNACIÓN:",
                 error
             );

             res.status(500).json({
                 error: "Error al consultar cumplimiento de vacunación"
             });
         }
     }
 );

// ==========================================
// EXPORTAR REPORTES A PDF O EXCEL
// ==========================================
router.get(
    "/exportar/:formato/:tipo",
    puedeExportar,
    obtenerFiltros,
    async (req, res) => {

        const { formato, tipo } = req.params;

        if (!["pdf", "excel"].includes(formato)) {
            return res.status(400).json({
                error: "Formato de exportación no válido"
            });
        }

        if (!configuraciones[tipo]) {
            return res.status(400).json({
                error: "Tipo de reporte no válido"
            });
        }

        const {
            comunidad,
            fechaInicio,
            fechaFin
        } = req.filtrosReportes;

        try {
            let consulta;
            const parametros = [
                comunidad,
                fechaInicio,
                fechaFin
            ];

            if (tipo === "ninos") {
                consulta = `
                    SELECT
                        c.nombre AS comunidad,
                        COUNT(n.id_nino)::integer AS total_ninos,

                        COUNT(n.id_nino) FILTER (
                            WHERE LOWER(TRIM(n.sexo))
                                IN ('masculino', 'm')
                        )::integer AS masculinos,

                        COUNT(n.id_nino) FILTER (
                            WHERE LOWER(TRIM(n.sexo))
                                IN ('femenino', 'f')
                        )::integer AS femeninos

                    FROM comunidades c
                    LEFT JOIN ninos n
                        ON n.id_comunidad = c.id_comunidad
                       AND ($2::date IS NULL
                            OR n.fecha_registro >= $2::date)
                       AND ($3::date IS NULL
                            OR n.fecha_registro < ($3::date + 1))

                    WHERE ($1::integer IS NULL
                           OR c.id_comunidad = $1)

                    GROUP BY c.id_comunidad, c.nombre
                    ORDER BY c.nombre
                `;
            }

            if (tipo === "vacunacion") {
                consulta = `
                    SELECT
                        v.nombre AS vacuna,
                        COUNT(rv.id_registro_vacuna)::integer
                            AS dosis_aplicadas

                    FROM vacunas v

                    LEFT JOIN esquema_vacunacion e
                        ON e.id_vacuna = v.id_vacuna

                    LEFT JOIN registros_vacunacion rv
                        ON rv.id_esquema = e.id_esquema
                       AND ($2::date IS NULL
                            OR rv.fecha_aplicacion >= $2::date)
                       AND ($3::date IS NULL
                            OR rv.fecha_aplicacion <= $3::date)
                       AND (
                            $1::integer IS NULL
                            OR EXISTS (
                                SELECT 1
                                FROM ninos n
                                WHERE n.id_nino = rv.id_nino
                                  AND n.id_comunidad = $1
                            )
                       )

                    GROUP BY v.id_vacuna, v.nombre
                    ORDER BY v.nombre
                `;
            }

            if (tipo === "alertas") {
                consulta = `
                    SELECT
                        a.estado,
                        COUNT(*)::integer AS total

                    FROM alertas a

                    INNER JOIN ninos n
                        ON n.id_nino = a.id_nino

                    WHERE ($1::integer IS NULL
                           OR n.id_comunidad = $1)
                      AND ($2::date IS NULL
                           OR a.fecha_alerta >= $2::date)
                      AND ($3::date IS NULL
                           OR a.fecha_alerta < ($3::date + 1))

                    GROUP BY a.estado
                    ORDER BY a.estado
                `;
            }

            
if (tipo === "cumplimiento-vacunacion") {
    consulta = `
        WITH seguimiento AS (
            SELECT
                n.id_nino,
                e.id_esquema,

                (
                    n.fecha_nacimiento
                    + make_interval(
                        months => e.edad_recomendada_meses
                    )
                )::date AS fecha_recomendada,

                EXISTS (
                    SELECT 1
                    FROM registros_vacunacion r
                    WHERE r.id_nino = n.id_nino
                      AND r.id_esquema = e.id_esquema
                ) AS aplicada

            FROM ninos n

            CROSS JOIN esquema_vacunacion e

            INNER JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna

            WHERE v.estado = TRUE
              AND (
                  $1::integer IS NULL
                  OR n.id_comunidad = $1
              )
        ),

        resumen AS (
            SELECT
                COUNT(*) FILTER (
                    WHERE aplicada
                      AND fecha_recomendada <= CURRENT_DATE
                )::integer AS dosis_aplicadas,

                COUNT(*) FILTER (
                    WHERE NOT aplicada
                      AND fecha_recomendada <= CURRENT_DATE
                )::integer AS dosis_pendientes,

                COUNT(*) FILTER (
                    WHERE NOT aplicada
                      AND fecha_recomendada > CURRENT_DATE
                      AND fecha_recomendada <= CURRENT_DATE + 30
                )::integer AS proximas_dosis,

                COUNT(*) FILTER (
                    WHERE fecha_recomendada <= CURRENT_DATE
                )::integer AS dosis_esperadas

            FROM seguimiento

            WHERE (
                $2::date IS NULL
                OR fecha_recomendada >= $2::date
            )
            AND (
                $3::date IS NULL
                OR fecha_recomendada <= $3::date
            )
        )

        SELECT
            dosis_aplicadas,
            dosis_pendientes,
            proximas_dosis,
            dosis_esperadas,

            CASE
                WHEN dosis_esperadas > 0
                THEN ROUND(
                    dosis_aplicadas::numeric
                    / dosis_esperadas * 100,
                    2
                )
                ELSE 0
            END AS porcentaje_cumplimiento

        FROM resumen
    `;
}


            const resultado = await pool.query(
                consulta,
                parametros
            );


            
// Preparar indicadores del reporte de cumplimiento
let registrosExportacion = resultado.rows;

if (tipo === "cumplimiento-vacunacion") {
    const datos = resultado.rows[0];

    registrosExportacion = [
        {
            concepto: "Dosis aplicadas",
            cantidad: datos.dosis_aplicadas
        },
        {
            concepto: "Dosis pendientes",
            cantidad: datos.dosis_pendientes
        },
        {
            concepto: "Próximas dosis",
            cantidad: datos.proximas_dosis
        },
        {
            concepto: "Dosis esperadas",
            cantidad: datos.dosis_esperadas
        },
        {
            concepto: "Porcentaje de cumplimiento",
            cantidad: `${datos.porcentaje_cumplimiento}%`
        }
    ];
}


            let nombreComunidad = "Todas las comunidades";

            if (comunidad !== null) {
                const consultaComunidad = await pool.query(`
                    SELECT nombre
                    FROM comunidades
                    WHERE id_comunidad = $1
                `, [comunidad]);

                if (!consultaComunidad.rowCount) {
                    return res.status(400).json({
                        error: "La comunidad seleccionada no existe"
                    });
                }

                nombreComunidad =
                    consultaComunidad.rows[0].nombre;
            }

            const reporte = prepararReporte(
                tipo,
                registrosExportacion,
                {
                    comunidad: nombreComunidad,
                    inicio: fechaInicio || "Sin límite",
                    fin: fechaFin || "Sin límite"
                }
            );

            if (formato === "pdf") {
                return exportarPDF(res, reporte);
            }

            await exportarExcel(res, reporte);

        } catch (error) {
            console.error("ERROR EXPORTAR REPORTE:", error);

            if (!res.headersSent) {
                res.status(500).json({
                    error: "Error al generar el reporte"
                });
            } else {
                res.destroy(error);
            }
        }
    }
);

module.exports = router;
