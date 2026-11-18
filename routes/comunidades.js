
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// Todas las rutas requieren sesión
router.use(requiereAutenticacion);

// ==========================================
// LISTAR COMUNIDADES
// Todos los usuarios autenticados
// ==========================================
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT id_comunidad, nombre, ubicacion,
                   numero_familias
            FROM comunidades
            ORDER BY id_comunidad DESC
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error("Error al listar:", error);

        res.status(500).json({
            error: "Error al obtener comunidades"
        });
    }
});

// ==========================================
// REGISTRAR COMUNIDAD
// Solo administrador
// ==========================================
router.post(
    "/",
    requiereRol("administrador"),
    async (req, res) => {
        try {
            const {
                nombre,
                ubicacion,
                numero_familias
            } = req.body;

            if (typeof nombre !== "string" || !nombre.trim()) {
                return res.status(400).json({
                    error: "El nombre es obligatorio"
                });
            }

            const familias =
                numero_familias === "" ||
                numero_familias == null
                    ? null
                    : Number(numero_familias);

            if (
                familias !== null &&
                (!Number.isSafeInteger(familias) || familias < 0)
            ) {
                return res.status(400).json({
                    error: "El número de familias debe ser un entero positivo o cero"
                });
            }

            const resultado = await pool.query(`
                INSERT INTO comunidades
                    (nombre, ubicacion, numero_familias)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [
                nombre.trim(),
                ubicacion || null,
                familias
            ]);

            res.status(201).json(resultado.rows[0]);

        } catch (error) {
            console.error("Error al registrar:", error);

            res.status(500).json({
                error: "Error al registrar comunidad"
            });
        }
    }
);

// ==========================================
// ACTUALIZAR COMUNIDAD
// Solo administrador
// ==========================================
router.put(
    "/:id",
    requiereRol("administrador"),
    async (req, res) => {
        try {
            const { id } = req.params;

            const {
                nombre,
                ubicacion,
                numero_familias
            } = req.body;

            if (typeof nombre !== "string" || !nombre.trim()) {
                return res.status(400).json({
                    error: "El nombre es obligatorio"
                });
            }

            const familias =
                numero_familias === "" ||
                numero_familias == null
                    ? null
                    : Number(numero_familias);

            if (
                familias !== null &&
                (!Number.isSafeInteger(familias) || familias < 0)
            ) {
                return res.status(400).json({
                    error: "Número de familias inválido"
                });
            }

            const resultado = await pool.query(`
                UPDATE comunidades
                SET nombre = $1,
                    ubicacion = $2,
                    numero_familias = $3
                WHERE id_comunidad = $4
                RETURNING *
            `, [
                nombre.trim(),
                ubicacion || null,
                familias,
                id
            ]);

            if (resultado.rowCount === 0) {
                return res.status(404).json({
                    error: "Comunidad no encontrada"
                });
            }

            res.json(resultado.rows[0]);

        } catch (error) {
            console.error("Error al actualizar:", error);

            res.status(500).json({
                error: "Error al actualizar comunidad"
            });
        }
    }
);

// ==========================================
// ELIMINAR COMUNIDAD
// Solo administrador
// ==========================================
router.delete(
    "/:id",
    requiereRol("administrador"),
    async (req, res) => {
        try {
            const resultado = await pool.query(
                `DELETE FROM comunidades
                 WHERE id_comunidad = $1
                 RETURNING id_comunidad`,
                [req.params.id]
            );

            if (resultado.rowCount === 0) {
                return res.status(404).json({
                    error: "Comunidad no encontrada"
                });
            }

            res.json({
                mensaje: "Comunidad eliminada correctamente"
            });

        } catch (error) {
            if (error.code === "23503") {
                return res.status(409).json({
                    error: "No se puede eliminar: la comunidad tiene registros relacionados"
                });
            }

            console.error("Error al eliminar:", error);

            res.status(500).json({
                error: "Error al eliminar comunidad"
            });
        }
    }
);

module.exports = router;

