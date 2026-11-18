

const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// ==========================================
// VERIFICAR AUTENTICACIÓN
// ==========================================
router.use(requiereAutenticacion);

// ==========================================
// PERMISOS DEL ESQUEMA DE VACUNACIÓN
// ==========================================
// Administrador, médico y enfermero:
// consultar, registrar, editar y eliminar.

router.use(
    requiereRol("administrador", "medico", "enfermero")
);


// VALIDACIONES
function validarEsquema(datos) {
    const { id_vacuna, numero_dosis, edad_recomendada_meses, observaciones } = datos;

    if (!Number.isSafeInteger(Number(id_vacuna)) ||
        Number(id_vacuna) <= 0) {
        return "Seleccione una vacuna válida";
    }

    if (numero_dosis === "" || numero_dosis == null ||
        !Number.isSafeInteger(Number(numero_dosis)) ||
        Number(numero_dosis) <= 0 || Number(numero_dosis) > 50) {
        return "El número de dosis debe estar entre 1 y 50";
    }

    if (edad_recomendada_meses === "" ||
        edad_recomendada_meses == null ||
        !Number.isSafeInteger(Number(edad_recomendada_meses)) ||
        Number(edad_recomendada_meses) < 0 ||
        Number(edad_recomendada_meses) > 240) {
        return "La edad recomendada debe estar entre 0 y 240 meses";
    }

    if (observaciones != null &&
        typeof observaciones !== "string") {
        return "Las observaciones no son válidas";
    }

    return null;
}

function manejarError(error, res) {
    console.error("ERROR ESQUEMA:", error);

    if (error.code === "23503") {
        return res.status(409).json({
            error: "No se puede eliminar o modificar el registro porque tiene datos relacionados"
        });
    }

    if (error.code === "23505") {
        return res.status(409).json({
            error: "Esta dosis ya está registrada para la vacuna"
        });
    }

    res.status(500).json({
        error: "Error al procesar el esquema de vacunación"
    });
}

// LISTAR DOSIS
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                e.id_esquema,
                e.id_vacuna,
                v.nombre AS vacuna,
                v.estado,
                e.numero_dosis,
                e.edad_recomendada_meses,
                e.observaciones
            FROM esquema_vacunacion e
            INNER JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna
            ORDER BY v.nombre, e.numero_dosis
        `);

        res.json(resultado.rows);
    } catch (error) {
        manejarError(error, res);
    }
});

// REGISTRAR DOSIS
router.post("/", async (req, res) => {
    const error = validarEsquema(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    const {
        id_vacuna,
        numero_dosis,
        edad_recomendada_meses,
        observaciones
    } = req.body;

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const vacuna = await cliente.query(`
            SELECT id_vacuna
            FROM vacunas
            WHERE id_vacuna = $1 AND estado = TRUE
        `, [id_vacuna]);

        if (!vacuna.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(400).json({
                error: "La vacuna no existe o está inactiva"
            });
        }

        await cliente.query(`
            SELECT pg_advisory_xact_lock(
                hashtextextended(
                    $1::text || ':' || $2::text, 0
                )
            )
        `, [id_vacuna, numero_dosis]);

        const duplicado = await cliente.query(`
            SELECT id_esquema
            FROM esquema_vacunacion
            WHERE id_vacuna = $1
              AND numero_dosis = $2
            LIMIT 1
        `, [id_vacuna, numero_dosis]);

        if (duplicado.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(409).json({
                error: "Esta dosis ya existe para la vacuna seleccionada"
            });
        }

        const resultado = await cliente.query(`
            INSERT INTO esquema_vacunacion (
                id_vacuna,
                numero_dosis,
                edad_recomendada_meses,
                observaciones
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [
            id_vacuna,
            numero_dosis,
            edad_recomendada_meses,
            observaciones || null
        ]);

        await cliente.query("COMMIT");

        res.status(201).json({
            mensaje: "Dosis registrada correctamente",
            esquema: resultado.rows[0]
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);
    } finally {
        cliente.release();
    }
});

// EDITAR DOSIS
router.put("/:id", async (req, res) => {
    const error = validarEsquema(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    const {
        id_vacuna,
        numero_dosis,
        edad_recomendada_meses,
        observaciones
    } = req.body;

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const actual = await cliente.query(`
            SELECT id_esquema, id_vacuna, numero_dosis
            FROM esquema_vacunacion
            WHERE id_esquema = $1
            FOR UPDATE
        `, [req.params.id]);

        if (!actual.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(404).json({
                error: "Dosis no encontrada"
            });
        }

        const vacuna = await cliente.query(`
            SELECT id_vacuna
            FROM vacunas
            WHERE id_vacuna = $1 AND estado = TRUE
        `, [id_vacuna]);

        if (!vacuna.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(400).json({
                error: "La vacuna no existe o está inactiva"
            });
        }

        const asociados = await cliente.query(`
            SELECT 1
            FROM registros_vacunacion
            WHERE id_esquema = $1
            LIMIT 1
        `, [req.params.id]);

        if (asociados.rowCount &&
            (Number(actual.rows[0].id_vacuna) !== Number(id_vacuna) ||
             Number(actual.rows[0].numero_dosis) !== Number(numero_dosis))) {
            await cliente.query("ROLLBACK");
            return res.status(409).json({
                error: "No se puede cambiar la vacuna ni el número de dosis porque ya existen aplicaciones registradas"
            });
        }

        await cliente.query(`
            SELECT pg_advisory_xact_lock(
                hashtextextended(
                    $1::text || ':' || $2::text, 0
                )
            )
        `, [id_vacuna, numero_dosis]);

        const duplicado = await cliente.query(`
            SELECT id_esquema
            FROM esquema_vacunacion
            WHERE id_vacuna = $1
              AND numero_dosis = $2
              AND id_esquema <> $3
            LIMIT 1
        `, [id_vacuna, numero_dosis, req.params.id]);

        if (duplicado.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(409).json({
                error: "Otra dosis ya tiene ese número para esta vacuna"
            });
        }

        await cliente.query(`
            UPDATE esquema_vacunacion
            SET id_vacuna = $1,
                numero_dosis = $2,
                edad_recomendada_meses = $3,
                observaciones = $4
            WHERE id_esquema = $5
        `, [
            id_vacuna,
            numero_dosis,
            edad_recomendada_meses,
            observaciones || null,
            req.params.id
        ]);

        await cliente.query("COMMIT");

        res.json({
            mensaje: "Dosis actualizada correctamente"
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);
    } finally {
        cliente.release();
    }
});

// ELIMINAR DOSIS SIN APLICACIONES
router.delete("/:id", async (req, res) => {
    try {
        const resultado = await pool.query(`
            DELETE FROM esquema_vacunacion
            WHERE id_esquema = $1
              AND NOT EXISTS (
                  SELECT 1
                  FROM registros_vacunacion
                  WHERE id_esquema = $1
              )
            RETURNING id_esquema
        `, [req.params.id]);

        if (!resultado.rowCount) {
            return res.status(409).json({
                error: "No se pudo eliminar. La dosis no existe o tiene aplicaciones registradas"
            });
        }

        res.json({
            mensaje: "Dosis eliminada correctamente"
        });

    } catch (error) {
        manejarError(error, res);
    }
});

module.exports = router;
