
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

const puedeGestionar = requiereRol(
    "administrador",
    "medico",
    "enfermero"
);

const estadosPermitidos = [
    "pendiente",
    "en_seguimiento",
    "atendida",
    "cerrada"
];

// ==========================================
// LISTAR HISTORIAL DE ALERTAS
// ==========================================
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                a.id_alerta,
                a.id_nino,
                n.nombres,
                n.apellidos,
                a.id_esquema,
                v.nombre AS vacuna,
                e.numero_dosis,
                a.tipo_alerta,
                a.descripcion,
                a.nivel,
                a.estado,
                TO_CHAR(
                    a.fecha_alerta,
                    'YYYY-MM-DD HH24:MI'
                ) AS fecha_alerta
            FROM alertas a

            INNER JOIN ninos n
                ON n.id_nino = a.id_nino

            LEFT JOIN esquema_vacunacion e
                ON e.id_esquema = a.id_esquema

            LEFT JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna

            ORDER BY
                a.fecha_alerta DESC,
                a.id_alerta DESC
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR HISTORIAL:", error);

        res.status(500).json({
            error: "Error al consultar historial de alertas"
        });
    }
});

// ==========================================
// REGISTRAR ALERTA DE VACUNACIÓN
// ==========================================
router.post("/", puedeGestionar, async (req, res) => {
    const {
        id_nino,
        id_esquema,
        descripcion
    } = req.body;

    const idNino = Number(id_nino);
    const idEsquema = Number(id_esquema);

    if (
        !Number.isSafeInteger(idNino) ||
        idNino <= 0 ||
        !Number.isSafeInteger(idEsquema) ||
        idEsquema <= 0
    ) {
        return res.status(400).json({
            error: "Seleccione un niño y una dosis válidos"
        });
    }

    if (
        descripcion != null &&
        typeof descripcion !== "string"
    ) {
        return res.status(400).json({
            error: "La descripción no es válida"
        });
    }

    if (
        typeof descripcion === "string" &&
        descripcion.length > 2000
    ) {
        return res.status(400).json({
            error: "La descripción es demasiado larga"
        });
    }

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        // Comprobar que el niño existe.
        const nino = await cliente.query(`
            SELECT id_nino
            FROM ninos
            WHERE id_nino = $1
        `, [idNino]);

        if (!nino.rowCount) {
            await cliente.query("ROLLBACK");

            return res.status(404).json({
                error: "El niño no existe"
            });
        }

        // Comprobar que la dosis existe.
        const dosis = await cliente.query(`
            SELECT e.id_esquema, v.nombre
            FROM esquema_vacunacion e
            INNER JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna
            WHERE e.id_esquema = $1
        `, [idEsquema]);

        if (!dosis.rowCount) {
            await cliente.query("ROLLBACK");

            return res.status(404).json({
                error: "La dosis no existe"
            });
        }

        // Evitar registrar una alerta de dosis
        // que ya tiene una aplicación registrada.
        const aplicada = await cliente.query(`
            SELECT 1
            FROM registros_vacunacion
            WHERE id_nino = $1
              AND id_esquema = $2
            LIMIT 1
        `, [idNino, idEsquema]);

        if (aplicada.rowCount) {
            await cliente.query("ROLLBACK");

            return res.status(409).json({
                error: "Esta dosis ya tiene una aplicación registrada"
            });
        }

        // El índice único de PostgreSQL
        // impide duplicados incluso ante
        // solicitudes simultáneas.
        const resultado = await cliente.query(`
            INSERT INTO alertas (
                id_nino,
                id_esquema,
                tipo_alerta,
                descripcion,
                nivel,
                estado
            )
            VALUES (
                $1,
                $2,
                'vacunacion',
                $3,
                'preventiva',
                'pendiente'
            )
            RETURNING *
        `, [
            idNino,
            idEsquema,
            descripcion?.trim() || null
        ]);

        await cliente.query("COMMIT");

        res.status(201).json({
            mensaje: "Alerta registrada correctamente",
            alerta: resultado.rows[0]
        });

    } catch (error) {
        await cliente.query("ROLLBACK");

        console.error("ERROR REGISTRAR ALERTA:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "Ya existe una alerta para este niño y esta dosis"
            });
        }

        if (error.code === "23503") {
            return res.status(400).json({
                error: "El niño o la dosis no son válidos"
            });
        }

        res.status(500).json({
            error: "Error al registrar la alerta"
        });

    } finally {
        cliente.release();
    }
});


 // ==========================================
 // ACTUALIZAR ESTADO Y REGISTRAR MOVIMIENTO
 // ==========================================
router.patch(
    "/:id/estado",
    puedeGestionar,
    async (req, res) => {

        const id = Number(req.params.id);
        const { estado } = req.body;

        const idUsuario = Number(
            req.session?.usuario?.id_usuario
        );

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Identificador de alerta inválido"
            });
        }

        if (!estadosPermitidos.includes(estado)) {
            return res.status(400).json({
                error: "Estado de alerta no válido"
            });
        }

        if (
            !Number.isSafeInteger(idUsuario) ||
            idUsuario <= 0
        ) {
            return res.status(401).json({
                error: "No se pudo identificar al usuario de la sesión"
            });
        }

        let cliente;

        try {
            cliente = await pool.connect();

            await cliente.query("BEGIN");

            // ==========================================
            // CONSULTAR ESTADO ANTERIOR
            // ==========================================
            const consulta = await cliente.query(`
                SELECT id_alerta, estado
                FROM alertas
                WHERE id_alerta = $1
                FOR UPDATE
            `, [id]);

            if (!consulta.rowCount) {
                await cliente.query("ROLLBACK");

                return res.status(404).json({
                    error: "Alerta no encontrada"
                });
            }

            const estadoAnterior = consulta.rows[0].estado;

            // Evitar movimientos innecesarios.
            if (estadoAnterior === estado) {
                await cliente.query("COMMIT");

                return res.json({
                    mensaje: "La alerta ya tiene ese estado",
                    sin_cambios: true
                });
            }

            // ==========================================
            // ACTUALIZAR ESTADO
            // ==========================================
            const resultado = await cliente.query(`
                UPDATE alertas
                SET estado = $1
                WHERE id_alerta = $2
                RETURNING *
            `, [estado, id]);

            // ==========================================
            // REGISTRAR MOVIMIENTO
            // ==========================================
            await cliente.query(`
                INSERT INTO historial_movimientos_alertas (
                    id_alerta,
                    id_usuario,
                    estado_anterior,
                    estado_nuevo
                )
                VALUES ($1, $2, $3, $4)
            `, [
                id,
                idUsuario,
                estadoAnterior,
                estado
            ]);

            await cliente.query("COMMIT");

            res.json({
                mensaje: "Estado actualizado correctamente",
                alerta: resultado.rows[0],
                movimiento: {
                    id_usuario: idUsuario,
                    estado_anterior: estadoAnterior,
                    estado_nuevo: estado
                }
            });

        } catch (error) {
            if (cliente) {
                try {
                    await cliente.query("ROLLBACK");
                } catch (rollbackError) {
                    console.error(
                        "ERROR ROLLBACK ALERTA:",
                        rollbackError
                    );
                }
            }

            console.error(
                "ERROR ACTUALIZAR ALERTA:",
                error
            );

            res.status(500).json({
                error: "Error al actualizar el estado de la alerta"
            });

        } finally {
            if (cliente) {
                cliente.release();
            }
        }
    }
);

// ==========================================
// CONSULTAR MOVIMIENTOS DE UNA ALERTA
// ==========================================
router.get("/:id/movimientos", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Identificador de alerta inválido"
        });
    }

    try {
        const resultado = await pool.query(`
            SELECT
                h.id_movimiento,
                h.id_alerta,
                h.estado_anterior,
                h.estado_nuevo,
                TO_CHAR(
                    h.fecha_movimiento,
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS fecha_movimiento,
                u.nombres,
                u.apellidos,
                r.nombre AS rol
            FROM historial_movimientos_alertas h
            INNER JOIN usuarios u
                ON u.id_usuario = h.id_usuario
            LEFT JOIN roles r
                ON r.id_rol = u.id_rol
            WHERE h.id_alerta = $1
            ORDER BY
                h.fecha_movimiento DESC,
                h.id_movimiento DESC
        `, [id]);

        res.json(resultado.rows);

    } catch (error) {
        console.error(
            "ERROR CONSULTAR MOVIMIENTOS:",
            error
        );

        res.status(500).json({
            error: "Error al consultar movimientos"
        });
    }
});



module.exports = router;


