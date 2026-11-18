
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// Verificar que el usuario haya iniciado sesión.
router.use(requiereAutenticacion);

// Permitir acceso completo únicamente a estos roles.
router.use(
    requiereRol("administrador", "medico", "enfermero")
);

function validarVacuna(datos) {
    if (typeof datos.nombre !== "string" ||
        !datos.nombre.trim()) {
        return "El nombre de la vacuna es obligatorio";
    }

    if (datos.nombre.trim().length > 150) {
        return "El nombre es demasiado largo";
    }

    if (datos.descripcion != null &&
        typeof datos.descripcion !== "string") {
        return "La descripción no es válida";
    }

    return null;
}

function manejarError(error, res) {
    console.error("ERROR VACUNAS:", error);

    if (error.code === "23505") {
        return res.status(409).json({
            error: "Ya existe una vacuna con ese nombre"
        });
    }

    res.status(500).json({
        error: "Error al procesar la vacuna"
    });
}

// LISTAR TODAS LAS VACUNAS
router.get("/", async (req, res) => {
  
    try {
        const resultado = await pool.query(`
            SELECT
                id_vacuna,
                nombre,
                descripcion,
                estado
            FROM vacunas
            ORDER BY nombre ASC
        `);

        res.json(resultado.rows);
    } catch (error) {
        manejarError(error, res);
    }
});

// REGISTRAR VACUNA
router.post("/", async (req, res) => {
    const error = validarVacuna(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    const nombre = req.body.nombre.trim();
    const descripcion = (req.body.descripcion || "").trim();

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        await cliente.query(`
            SELECT pg_advisory_xact_lock(
                hashtextextended(LOWER($1::text), 0)
            )
        `, [nombre]);

        const existente = await cliente.query(`
            SELECT id_vacuna
            FROM vacunas
            WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
            LIMIT 1
        `, [nombre]);

        if (existente.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(409).json({
                error: "Esta vacuna ya está registrada"
            });
        }

        const resultado = await cliente.query(`
            INSERT INTO vacunas (
                nombre, descripcion, estado
            )
            VALUES ($1, $2, TRUE)
            RETURNING *
        `, [nombre, descripcion]);

        await cliente.query("COMMIT");

        res.status(201).json({
            mensaje: "Vacuna registrada correctamente",
            vacuna: resultado.rows[0]
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);
    } finally {
        cliente.release();
    }
});

// ACTUALIZAR VACUNA
router.put("/:id", async (req, res) => {
    const error = validarVacuna(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    const nombre = req.body.nombre.trim();
    const descripcion = (req.body.descripcion || "").trim();

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        await cliente.query(`
            SELECT pg_advisory_xact_lock(
                hashtextextended(LOWER($1::text), 0)
            )
        `, [nombre]);

        const duplicado = await cliente.query(`
            SELECT id_vacuna
            FROM vacunas
            WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
              AND id_vacuna <> $2
            LIMIT 1
        `, [nombre, req.params.id]);

        if (duplicado.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(409).json({
                error: "Ya existe otra vacuna con ese nombre"
            });
        }

        const resultado = await cliente.query(`
            UPDATE vacunas
            SET nombre = $1,
                descripcion = $2
            WHERE id_vacuna = $3
            RETURNING *
        `, [nombre, descripcion, req.params.id]);

        if (!resultado.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(404).json({
                error: "Vacuna no encontrada"
            });
        }

        await cliente.query("COMMIT");

        res.json({
            mensaje: "Vacuna actualizada correctamente"
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);
    } finally {
        cliente.release();
    }
});

// ACTIVAR O DESACTIVAR VACUNA
router.patch("/:id/estado", async (req, res) => {
    if (typeof req.body.estado !== "boolean") {
        return res.status(400).json({
            error: "El estado debe ser verdadero o falso"
        });
    }

    try {
        const resultado = await pool.query(`
            UPDATE vacunas
            SET estado = $1
            WHERE id_vacuna = $2
            RETURNING id_vacuna, nombre, estado
        `, [req.body.estado, req.params.id]);

        if (!resultado.rowCount) {
            return res.status(404).json({
                error: "Vacuna no encontrada"
            });
        }

        res.json({
            mensaje: req.body.estado
                ? "Vacuna activada correctamente"
                : "Vacuna desactivada correctamente",
            vacuna: resultado.rows[0]
        });

    } catch (error) {
        manejarError(error, res);
    }
});

module.exports = router;
