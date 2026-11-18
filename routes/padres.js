
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// ==========================================
// TODAS LAS RUTAS REQUIEREN SESIÓN
// ==========================================
router.use(requiereAutenticacion);

// ==========================================
// LISTAR PADRES CON SU COMUNIDAD
// Todos los usuarios autenticados
// ==========================================
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                p.id_padre,
                p.nombres,
                p.apellidos,
                p.dpi,
                p.telefono,
                p.correo,
                p.canal_notificacion,
                p.id_comunidad,
                c.nombre AS comunidad
            FROM padres p
            LEFT JOIN comunidades c
                ON p.id_comunidad = c.id_comunidad
            ORDER BY p.id_padre DESC
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error("ERROR PADRES:", error);

        res.status(500).json({
            error: "Error al consultar padres"
        });
    }
});

// ==========================================
// REGISTRAR PADRE
// Administrador, médico y enfermero
// ==========================================
router.post(
    "/",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => {
        try {
            const {
                nombres, apellidos, dpi, telefono,
                correo, canal_notificacion, id_comunidad
            } = req.body;

            if (!nombres?.trim() || !apellidos?.trim()) {
                return res.status(400).json({
                    error: "Nombres y apellidos son obligatorios"
                });
            }

            if (dpi && !/^\d{13}$/.test(dpi)) {
                return res.status(400).json({
                    error: "El DPI debe contener 13 dígitos"
                });
            }

            const resultado = await pool.query(`
                INSERT INTO padres (
                    nombres, apellidos, dpi, telefono,
                    correo, canal_notificacion, id_comunidad
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                RETURNING *
            `, [
                nombres.trim(),
                apellidos.trim(),
                dpi || null,
                telefono || null,
                correo || null,
                canal_notificacion || null,
                id_comunidad || null
            ]);

            res.status(201).json(resultado.rows[0]);

        } catch (error) {
            manejarError(error, res);
        }
    }
);

// ==========================================
// ACTUALIZAR PADRE
// Administrador, médico y enfermero
// ==========================================
router.put(
    "/:id",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => {
        try {
            const {
                nombres, apellidos, dpi, telefono,
                correo, canal_notificacion, id_comunidad
            } = req.body;

            if (!nombres?.trim() || !apellidos?.trim()) {
                return res.status(400).json({
                    error: "Nombres y apellidos son obligatorios"
                });
            }

            if (dpi && !/^\d{13}$/.test(dpi)) {
                return res.status(400).json({
                    error: "El DPI debe contener 13 dígitos"
                });
            }

            const resultado = await pool.query(`
                UPDATE padres
                SET nombres=$1,
                    apellidos=$2,
                    dpi=$3,
                    telefono=$4,
                    correo=$5,
                    canal_notificacion=$6,
                    id_comunidad=$7
                WHERE id_padre=$8
                RETURNING *
            `, [
                nombres.trim(),
                apellidos.trim(),
                dpi || null,
                telefono || null,
                correo || null,
                canal_notificacion || null,
                id_comunidad || null,
                req.params.id
            ]);

            if (!resultado.rowCount) {
                return res.status(404).json({
                    error: "Padre no encontrado"
                });
            }

            res.json(resultado.rows[0]);

        } catch (error) {
            manejarError(error, res);
        }
    }
);

// ==========================================
// ELIMINAR PADRE
// Únicamente administrador
// ==========================================
router.delete(
    "/:id",
    requiereRol("administrador"),
    async (req, res) => {
        try {
            const resultado = await pool.query(
                "DELETE FROM padres WHERE id_padre=$1 RETURNING id_padre",
                [req.params.id]
            );

            if (!resultado.rowCount) {
                return res.status(404).json({
                    error: "Padre no encontrado"
                });
            }

            res.json({
                mensaje: "Registro eliminado correctamente"
            });

        } catch (error) {
            manejarError(error, res);
        }
    }
);

// ==========================================
// ERRORES DE POSTGRESQL
// ==========================================
function manejarError(error, res) {
    console.error("ERROR PADRES:", error);

    if (error.code === "23505") {
        return res.status(409).json({
            error: "El DPI ya está registrado"
        });
    }

    if (error.code === "23503") {
        return res.status(409).json({
            error: "La comunidad no existe o el padre tiene niños asociados"
        });
    }

    if (error.code === "23514" || error.code === "22P02") {
        return res.status(400).json({
            error: "Uno de los datos ingresados no es válido"
        });
    }

    res.status(500).json({
        error: "Error al procesar la solicitud"
    });
}

module.exports = router;
