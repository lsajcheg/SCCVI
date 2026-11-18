
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// ==========================================
// SEGURIDAD DEL DASHBOARD
// ==========================================
router.use(requiereAutenticacion);

router.use(
    requiereRol(
        "administrador",
        "medico",
        "enfermero",
        "encargado"
    )
);

// ==========================================
// ESTADÍSTICAS GENERALES
// ==========================================
router.get("/resumen", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM ninos)
                    AS total_ninos,

                (SELECT COUNT(*) FROM padres)
                    AS total_padres,

                (SELECT COUNT(*) FROM comunidades)
                    AS total_comunidades,

                (SELECT COUNT(*) FROM registros_vacunacion)
                    AS total_vacunas,

                (SELECT COUNT(*) FROM registros_crecimiento)
                    AS total_crecimiento
        `);

        res.json(resultado.rows[0]);

    } catch (error) {
        console.error("ERROR DASHBOARD:", error);

        res.status(500).json({
            error: "Error al obtener estadísticas generales"
        });
    }
});

// ==========================================
// VACUNAS APLICADAS POR MES
// ÚLTIMOS 6 MESES, INCLUYENDO EL ACTUAL
// ==========================================
router.get("/vacunacion-mensual", async (req, res) => {
    try {
        const resultado = await pool.query(`
            WITH meses AS (
                SELECT generate_series(
                    date_trunc('month', CURRENT_DATE)
                        - INTERVAL '5 months',
                    date_trunc('month', CURRENT_DATE),
                    INTERVAL '1 month'
                )::date AS mes
            )
            SELECT
                TO_CHAR(m.mes, 'YYYY-MM') AS mes,
                COUNT(r.id_registro_vacuna)::integer AS total
            FROM meses m
            LEFT JOIN registros_vacunacion r
                ON r.fecha_aplicacion >= m.mes
                AND r.fecha_aplicacion <
                    m.mes + INTERVAL '1 month'
            GROUP BY m.mes
            ORDER BY m.mes ASC
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR GRÁFICO:", error);

        res.status(500).json({
            error: "Error al obtener aplicaciones mensuales"
        });
    }
});

module.exports = router;
