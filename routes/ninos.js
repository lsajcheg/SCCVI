
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// Todas las operaciones requieren iniciar sesión
router.use(requiereAutenticacion);


// CONSULTAR NIÑOS Y SUS PADRES
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                n.id_nino,
                n.nombres,
                n.apellidos,
                n.fecha_nacimiento,
                n.sexo,
                n.id_comunidad,
                c.nombre AS comunidad,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id_padre', p.id_padre,
                            'nombre', p.nombres || ' ' || p.apellidos,
                            'parentesco', np.parentesco,
                            'responsable_principal',
                                np.responsable_principal
                        )
                    ) FILTER (WHERE p.id_padre IS NOT NULL),
                    '[]'::json
                ) AS padres
            FROM ninos n
            JOIN comunidades c
                ON n.id_comunidad = c.id_comunidad
            LEFT JOIN ninos_padres np
                ON n.id_nino = np.id_nino
            LEFT JOIN padres p
                ON np.id_padre = p.id_padre
            GROUP BY n.id_nino, c.nombre
            ORDER BY n.id_nino DESC
        `);

        res.json(resultado.rows);
    } catch (error) {
        console.error("ERROR NIÑOS:", error);
        res.status(500).json({
            error: "Error al consultar niños"
        });
    }
});

// VALIDACIÓN DE DATOS
function validar(datos) {
    const {
        nombres, apellidos, fecha_nacimiento,
        sexo, id_comunidad, padres
    } = datos;

    if (typeof nombres !== "string" || !nombres.trim() ||
        typeof apellidos !== "string" || !apellidos.trim()) {
        return "Nombres y apellidos son obligatorios";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento || "")) {
        return "Fecha de nacimiento inválida";
    }

    const fecha = new Date(fecha_nacimiento + "T00:00:00Z");
    if (isNaN(fecha.getTime()) ||
        fecha.toISOString().slice(0, 10) !== fecha_nacimiento ||
        fecha > new Date()) {
        return "La fecha de nacimiento no es válida";
    }

    if (!["M", "F"].includes(sexo)) {
        return "Seleccione el sexo";
    }

    if (!Number.isSafeInteger(Number(id_comunidad)) ||
        Number(id_comunidad) <= 0) {
        return "Seleccione una comunidad";
    }

    if (!Array.isArray(padres) || padres.length === 0) {
        return "Debe asociar al menos un padre o tutor";
    }

    const ids = padres.map(p => Number(p.id_padre));

    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(ids).size !== ids.length) {
        return "Hay padres duplicados o inválidos";
    }

    if (padres.some(p =>
        typeof p.parentesco !== "string" ||
        p.parentesco.length > 30)) {
        return "Parentesco inválido";
    }

    if (padres.filter(p => p.responsable_principal === true).length !== 1) {
        return "Seleccione exactamente un responsable principal";
    }

    return null;
}

// GUARDAR RELACIONES CON PADRES
async function guardarPadres(cliente, idNino, padres) {
    for (const padre of padres) {
        await cliente.query(`
            INSERT INTO ninos_padres
                (id_nino, id_padre, parentesco, responsable_principal)
            VALUES ($1, $2, $3, $4)
        `, [
            idNino,
            padre.id_padre,
            padre.parentesco || null,
            padre.responsable_principal === true
        ]);
    }
}


async function buscarNinoDuplicado(
    cliente,
    nombres,
    apellidos,
    fechaNacimiento,
    excluirId = null
) {
    const resultado = await cliente.query(`
        SELECT
            id_nino,
            nombres,
            apellidos,
            fecha_nacimiento
        FROM ninos
        WHERE LOWER(TRIM(nombres)) = LOWER(TRIM($1))
          AND LOWER(TRIM(apellidos)) = LOWER(TRIM($2))
          AND fecha_nacimiento = $3
          AND ($4::integer IS NULL OR id_nino <> $4)
        LIMIT 1
    `, [
        nombres,
        apellidos,
        fechaNacimiento,
        excluirId
    ]);

    return resultado.rows[0] || null;
}



// REGISTRAR NIÑO

//router.post("/", async (req, res) => {

router.post(
    "/",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => {

    const errorValidacion = validar(req.body);

    if (errorValidacion) {
        return res.status(400).json({
            error: errorValidacion
        });
    }

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const {
            nombres,
            apellidos,
            fecha_nacimiento,
            sexo,
            id_comunidad,
            padres
        } = req.body;

        // Evitar registros simultáneos duplicados
        await cliente.query(`
            SELECT pg_advisory_xact_lock(
                hashtextextended(
                    LOWER(TRIM($1::text)) || '|' ||
                    LOWER(TRIM($2::text)) || '|' ||
                    $3::text,
                    0
                )
            )
        `, [
            nombres,
            apellidos,
            fecha_nacimiento
        ]);

        // VERIFICAR SI EL NIÑO YA EXISTE
        const duplicado = await buscarNinoDuplicado(
            cliente,
            nombres.trim(),
            apellidos.trim(),
            fecha_nacimiento
        );

        if (duplicado) {
            await cliente.query("ROLLBACK");

            return res.status(409).json({
                error: "El niño ya se encuentra registrado en la base de datos.",
                id_nino: duplicado.id_nino,
                mensaje: "Utilice la opción Editar para agregar otro padre o tutor."
            });
        }

        // REGISTRAR NIÑO
        const resultado = await cliente.query(`
            INSERT INTO ninos (
                nombres,
                apellidos,
                fecha_nacimiento,
                sexo,
                id_comunidad
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [
            nombres.trim(),
            apellidos.trim(),
            fecha_nacimiento,
            sexo,
            id_comunidad
        ]);

        // ASOCIAR PADRES
        await guardarPadres(
            cliente,
            resultado.rows[0].id_nino,
            padres
        );

        await cliente.query("COMMIT");

        res.status(201).json({
            mensaje: "Niño registrado correctamente",
            nino: resultado.rows[0]
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);

    } finally {
        cliente.release();
    }
});


// ACTUALIZAR NIÑO
//router.put("/:id", async (req, res) => {
router.put(
    "/:id",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => {

    const errorValidacion = validar(req.body);

    if (errorValidacion) {
        return res.status(400).json({ error: errorValidacion });
    }

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const {
            nombres, apellidos, fecha_nacimiento,
            sexo, id_comunidad, padres
        } = req.body;

        const resultado = await cliente.query(`
            UPDATE ninos
            SET nombres = $1,
                apellidos = $2,
                fecha_nacimiento = $3,
                sexo = $4,
                id_comunidad = $5
            WHERE id_nino = $6
            RETURNING *
        `, [
            nombres.trim(), apellidos.trim(),
            fecha_nacimiento, sexo,
            id_comunidad, req.params.id
        ]);

        if (!resultado.rowCount) {
            await cliente.query("ROLLBACK");
            return res.status(404).json({
                error: "Niño no encontrado"
            });
        }

        await cliente.query(
            "DELETE FROM ninos_padres WHERE id_nino = $1",
            [req.params.id]
        );

        await guardarPadres(cliente, req.params.id, padres);

        await cliente.query("COMMIT");

        res.json({
            mensaje: "Niño actualizado correctamente"
        });

    } catch (error) {
        await cliente.query("ROLLBACK");
        manejarError(error, res);
    } finally {
        cliente.release();
    }
});

// ELIMINAR NIÑO
//router.delete("/:id", async (req, res) => {
  router.delete(
    "/:id",
    requiereRol("administrador"),
    async (req, res) => {
  
    try {
        const resultado = await pool.query(`
            DELETE FROM ninos
            WHERE id_nino = $1
            RETURNING id_nino
        `, [req.params.id]);

        if (!resultado.rowCount) {
            return res.status(404).json({
                error: "Niño no encontrado"
            });
        }

        res.json({
            mensaje: "Niño eliminado correctamente"
        });

    } catch (error) {
        manejarError(error, res);
    }
});

function manejarError(error, res) {
    console.error("ERROR NIÑOS:", error);

    if (error.code === "23503") {
        return res.status(409).json({
            error: "Registro relacionado inexistente o el niño tiene historial asociado"
        });
    }

    if (["23505", "23514", "22P02", "22007"].includes(error.code)) {
        return res.status(400).json({
            error: "Datos duplicados o inválidos"
        });
    }

    res.status(500).json({
        error: "Error al procesar la solicitud"
    });
}

module.exports = router;
