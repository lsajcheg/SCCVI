
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// Proteger todas las rutas de vacunación
router.use(requiereAutenticacion);


// Validar fechas sin permitir días inexistentes
function fechaValida(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || "")) return false;

    const fecha = new Date(valor + "T00:00:00Z");
    return !isNaN(fecha.getTime()) &&
        fecha.toISOString().slice(0, 10) === valor;
}

function validarDatos(datos) {
    const {
        id_nino, id_esquema,
        fecha_aplicacion, proxima_dosis
    } = datos;

    if (!Number.isSafeInteger(Number(id_nino)) ||
        Number(id_nino) <= 0) {
        return "Seleccione un niño válido";
    }

    if (!Number.isSafeInteger(Number(id_esquema)) ||
        Number(id_esquema) <= 0) {
        return "Seleccione una dosis válida";
    }

    if (!fechaValida(fecha_aplicacion)) {
        return "Ingrese una fecha de aplicación válida";
    }

    const hoy = new Date().toISOString().slice(0, 10);

    if (fecha_aplicacion > hoy) {
        return "La aplicación no puede tener una fecha futura";
    }

    if (proxima_dosis) {
        if (!fechaValida(proxima_dosis)) {
            return "La fecha de próxima dosis no es válida";
        }

        if (proxima_dosis <= fecha_aplicacion) {
            return "La próxima dosis debe ser posterior a la aplicación";
        }
    }

    return null;
}

function manejarError(error, res) {
    console.error("ERROR VACUNACIÓN:", error);

    if (error.code === "23503") {
        return res.status(400).json({
            error: "El niño o esquema seleccionado no existe"
        });
    }

    if (error.code === "23502") {
        return res.status(400).json({
            error: "Falta un dato obligatorio en la base de datos"
        });
    }

    res.status(500).json({
        error: "Error al procesar el registro de vacunación"
    });
}

// CATÁLOGO DE VACUNAS ACTIVAS
router.get("/vacunas", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT id_vacuna, nombre, descripcion, estado
            FROM vacunas
            WHERE estado = TRUE
            ORDER BY nombre
        `);

        res.json(resultado.rows);
    } catch (error) {
        manejarError(error, res);
    }
});

// ESQUEMA DE VACUNACIÓN
router.get("/esquema", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                e.id_esquema,
                e.id_vacuna,
                v.nombre AS vacuna,
                e.numero_dosis,
                e.edad_recomendada_meses,
                e.observaciones
            FROM esquema_vacunacion e
            INNER JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna
            WHERE v.estado = TRUE
            ORDER BY v.nombre, e.numero_dosis
        `);

        res.json(resultado.rows);
    } catch (error) {
        manejarError(error, res);
    }
});

// LISTAR REGISTROS DE VACUNACIÓN
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                r.id_registro_vacuna,
                r.id_nino,
                n.nombres,
                n.apellidos,
                r.id_esquema,
                v.nombre AS vacuna,
                e.numero_dosis,
                r.fecha_aplicacion,
                r.proxima_dosis,
                r.observaciones
            FROM registros_vacunacion r
            INNER JOIN ninos n
                ON n.id_nino = r.id_nino
            INNER JOIN esquema_vacunacion e
                ON e.id_esquema = r.id_esquema
            INNER JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna
            ORDER BY r.fecha_aplicacion DESC,
                     r.id_registro_vacuna DESC
        `);

        res.json(resultado.rows);
    } catch (error) {
        manejarError(error, res);
    }
});

// REGISTRAR VACUNA APLICADA
//router.post("/", async (req, res) => {
  router.post(
    "/",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => {
  
    const error = validarDatos(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    const {
        id_nino,
        id_esquema,
        fecha_aplicacion,
        proxima_dosis,
        observaciones
    } = req.body;

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        // Comprobar niño y fecha de nacimiento
        const nino = await cliente.query(`
            SELECT fecha_nacimiento
            FROM ninos
            WHERE id_nino = $1
        `, [id_nino]);

        if (!nino.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(404).json({
                error: "El niño seleccionado no existe"
            });
        }

        const nacimiento = new Date(nino.rows[0].fecha_nacimiento)
            .toISOString().slice(0, 10);

        if (fecha_aplicacion < nacimiento) {
            await cliente.query("ROLLBACK");
            return res.status(400).json({
                error: "La fecha de aplicación es anterior al nacimiento"
            });
        }

        // Comprobar esquema activo
        const esquema = await cliente.query(`
            SELECT e.id_esquema
            FROM esquema_vacunacion e
            INNER JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna
            WHERE e.id_esquema = $1
              AND v.estado = TRUE
        `, [id_esquema]);

        if (!esquema.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(400).json({
                error: "La dosis seleccionada no está disponible"
            });
        }

        // Evitar registrar dos veces la misma dosis
        await cliente.query(`
            SELECT pg_advisory_xact_lock(
                hashtextextended($1::text || ':' || $2::text, 0)
            )
        `, [id_nino, id_esquema]);

        const duplicado = await cliente.query(`
            SELECT id_registro_vacuna
            FROM registros_vacunacion
            WHERE id_nino = $1 AND id_esquema = $2
            LIMIT 1
        `, [id_nino, id_esquema]);

        if (duplicado.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(409).json({
                error: "Esta dosis ya está registrada para el niño"
            });
        }

        const resultado = await cliente.query(`
            INSERT INTO registros_vacunacion (
                id_nino,
                id_esquema,
                fecha_aplicacion,
                proxima_dosis,
                observaciones
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [
            id_nino,
            id_esquema,
            fecha_aplicacion,
            proxima_dosis || null,
            observaciones || null
        ]);

        await cliente.query("COMMIT");

        res.status(201).json({
            mensaje: "Vacuna registrada correctamente",
            registro: resultado.rows[0]
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);
    } finally {
        cliente.release();
    }
});

// EDITAR REGISTRO
//router.put("/:id", async (req, res) => {
 router.put(
    "/:id",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => { 
  
    const error = validarDatos(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    const {
        id_nino,
        id_esquema,
        fecha_aplicacion,
        proxima_dosis,
        observaciones
    } = req.body;

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const existente = await cliente.query(`
            SELECT id_registro_vacuna
            FROM registros_vacunacion
            WHERE id_registro_vacuna = $1
            FOR UPDATE
        `, [req.params.id]);

        if (!existente.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(404).json({
                error: "Registro no encontrado"
            });
        }

        const nino = await cliente.query(`
            SELECT fecha_nacimiento
            FROM ninos
            WHERE id_nino = $1
        `, [id_nino]);

        if (!nino.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(404).json({
                error: "Niño no encontrado"
            });
        }

        const nacimiento = new Date(nino.rows[0].fecha_nacimiento)
            .toISOString().slice(0, 10);

        if (fecha_aplicacion < nacimiento) {
            await cliente.query("ROLLBACK");
            return res.status(400).json({
                error: "La aplicación es anterior al nacimiento"
            });
        }

        const esquema = await cliente.query(`
            SELECT e.id_esquema
            FROM esquema_vacunacion e
            INNER JOIN vacunas v
                ON v.id_vacuna = e.id_vacuna
            WHERE e.id_esquema = $1 AND v.estado = TRUE
        `, [id_esquema]);

        if (!esquema.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(400).json({
                error: "Esquema no disponible"
            });
        }

        await cliente.query(`
            SELECT pg_advisory_xact_lock(
                hashtextextended($1::text || ':' || $2::text, 0)
            )
        `, [id_nino, id_esquema]);

        const duplicado = await cliente.query(`
            SELECT id_registro_vacuna
            FROM registros_vacunacion
            WHERE id_nino = $1
              AND id_esquema = $2
              AND id_registro_vacuna <> $3
            LIMIT 1
        `, [id_nino, id_esquema, req.params.id]);

        if (duplicado.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(409).json({
                error: "Esta dosis ya está registrada para el niño"
            });
        }

        await cliente.query(`
            UPDATE registros_vacunacion
            SET id_nino = $1,
                id_esquema = $2,
                fecha_aplicacion = $3,
                proxima_dosis = $4,
                observaciones = $5
            WHERE id_registro_vacuna = $6
        `, [
            id_nino,
            id_esquema,
            fecha_aplicacion,
            proxima_dosis || null,
            observaciones || null,
            req.params.id
        ]);

        await cliente.query("COMMIT");

        res.json({
            mensaje: "Registro de vacunación actualizado"
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);
    } finally {
        cliente.release();
    }
});

// ELIMINAR REGISTRO
//router.delete("/:id", async (req, res) => {
  router.delete(
    "/:id",
    requiereRol("administrador"),
    async (req, res) => {

    try {
        const resultado = await pool.query(`
            DELETE FROM registros_vacunacion
            WHERE id_registro_vacuna = $1
            RETURNING id_registro_vacuna
        `, [req.params.id]);

        if (!resultado.rowCount) {
            return res.status(404).json({
                error: "Registro no encontrado"
            });
        }

        res.json({
            mensaje: "Registro de vacunación eliminado"
        });

    } catch (error) {
        manejarError(error, res);
    }
});

module.exports = router;
