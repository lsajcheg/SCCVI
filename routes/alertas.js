
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

router.use(
    requiereRol(
        "administrador",
        "medico",
        "enfermero",
        "encargado"
    )
);

// ==========================================
// CONSULTAR SEGUIMIENTO DE DOSIS
// ==========================================
router.get("/vacunacion", async (req, res) => {
    try {
        const resultado = await pool.query(`
            WITH seguimiento AS (
                SELECT
                    n.id_nino,
                    n.nombres,
                    n.apellidos,
                    n.fecha_nacimiento,
                    v.nombre AS vacuna,
                    e.id_esquema,
                    e.numero_dosis,
                    e.edad_recomendada_meses,

                    (
                        n.fecha_nacimiento
                        + make_interval(
                            months => e.edad_recomendada_meses
                        )
                    )::date AS fecha_recomendada

                FROM ninos n

                CROSS JOIN esquema_vacunacion e

                INNER JOIN vacunas v
                    ON v.id_vacuna = e.id_vacuna

                WHERE v.estado = TRUE

                AND NOT EXISTS (
                    SELECT 1
                    FROM registros_vacunacion r
                    WHERE r.id_nino = n.id_nino
                      AND r.id_esquema = e.id_esquema
                )
            )

            SELECT
    id_nino,
    nombres,
    apellidos,
    TO_CHAR(fecha_nacimiento, 'YYYY-MM-DD')
        AS fecha_nacimiento,
    vacuna,
    id_esquema,
    numero_dosis,
    edad_recomendada_meses,
    TO_CHAR(fecha_recomendada, 'YYYY-MM-DD')
        AS fecha_recomendada,
    CASE
                    WHEN fecha_recomendada <= CURRENT_DATE
                        THEN 'pendiente'

                    WHEN fecha_recomendada
                         <= CURRENT_DATE + 30
                        THEN 'proxima'
                END AS estado_seguimiento

            FROM seguimiento

            WHERE fecha_recomendada
                  <= CURRENT_DATE + 30

            ORDER BY
                fecha_recomendada ASC,
                apellidos ASC,
                nombres ASC,
                vacuna ASC,
                numero_dosis ASC
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR ALERTAS:", error);

        res.status(500).json({
            error: "Error al consultar seguimiento de vacunación"
        });
    }
});

module.exports = router;
