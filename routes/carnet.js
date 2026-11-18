
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

const {
    generarCarnetPDF
} = require("../services/exportarCarnet");

const {
    generarQR
} = require("../services/generarQR");

// Todas las rutas requieren autenticación
router.use(requiereAutenticacion);


function protegerOrigenCarnet(req, res, next) {
    const origen = req.get("Origin");

    if (!origen || origen === "null") {
        return res.status(403).json({
            error: "No se pudo verificar el origen de la solicitud"
        });
    }

    let origenPermitido;

    try {
        origenPermitido = new URL(
            `${req.protocol}://${req.get("host")}`
        ).origin;
    } catch {
        return res.status(403).json({
            error: "Origen de solicitud no válido"
        });
    }

    if (origen !== origenPermitido) {
        return res.status(403).json({
            error: "Solicitud rechazada por seguridad"
        });
    }

    next();
}


const {
    generarPIN,
    generarTokenQR,
    crearHashPIN
} = require("../services/seguridadCarnet");

// ==========================================
// CONSULTAR INFORMACIÓN DEL CARNET
// ==========================================
async function consultarCarnet(idNino) {

    // 1. DATOS DEL NIÑO
    const resultadoNino = await pool.query(`
        SELECT
            n.id_nino,
            n.nombres,
            n.apellidos,
            n.fecha_nacimiento,
            n.sexo,
            c.nombre AS comunidad
        FROM ninos n
        INNER JOIN comunidades c
            ON c.id_comunidad = n.id_comunidad
        WHERE n.id_nino = $1
    `, [idNino]);

    if (!resultadoNino.rowCount) {
        return null;
    }

    // 2. RESPONSABLE PRINCIPAL
    const resultadoResponsable = await pool.query(`
        SELECT
            p.nombres,
            p.apellidos,
            np.parentesco
        FROM ninos_padres np
        INNER JOIN padres p
            ON p.id_padre = np.id_padre
        WHERE np.id_nino = $1
          AND np.responsable_principal = TRUE
        LIMIT 1
    `, [idNino]);

    // 3. ESQUEMA E HISTORIAL DE VACUNACIÓN
    const resultadoVacunas = await pool.query(`
        SELECT
            e.id_esquema,
            v.nombre AS vacuna,
            e.numero_dosis,
            e.edad_recomendada_meses,

            (
                n.fecha_nacimiento
                + make_interval(
                    months => e.edad_recomendada_meses
                )
            )::date AS fecha_recomendada,

            r.fecha_aplicacion,
            r.proxima_dosis,

            CASE
                WHEN r.id_registro_vacuna IS NOT NULL
                    THEN 'aplicada'

                WHEN (
                    n.fecha_nacimiento
                    + make_interval(
                        months => e.edad_recomendada_meses
                    )
                )::date <= CURRENT_DATE
                    THEN 'pendiente'

                ELSE 'programada'
            END AS estado

        FROM ninos n

        CROSS JOIN esquema_vacunacion e

        INNER JOIN vacunas v
            ON v.id_vacuna = e.id_vacuna

        LEFT JOIN registros_vacunacion r
            ON r.id_nino = n.id_nino
           AND r.id_esquema = e.id_esquema

        WHERE n.id_nino = $1
          AND v.estado = TRUE

        ORDER BY
            e.edad_recomendada_meses,
            v.nombre,
            e.numero_dosis
    `, [idNino]);

    
    // ==========================================
    // ÚLTIMOS CONTROLES DE CRECIMIENTO
    // ==========================================

    const resultadoCrecimiento = await pool.query(`
        SELECT
            id_registro,
            fecha_medicion,
            peso_kg,
            talla_cm,
            observaciones
        FROM registros_crecimiento
        WHERE id_nino = $1
        ORDER BY fecha_medicion DESC, id_registro DESC
        LIMIT 5
    `, [idNino]);


    
return {
    nino: resultadoNino.rows[0],
    responsable: resultadoResponsable.rows[0] || null,
    vacunacion: resultadoVacunas.rows,
    crecimiento: resultadoCrecimiento.rows
    };
}


// ==========================================
// VALIDAR IDENTIFICADOR
// ==========================================
function validarId(req, res, next) {
    const idNino = Number(req.params.id);

    if (!Number.isSafeInteger(idNino) || idNino <= 0) {
        return res.status(400).json({
            error: "Identificador del niño no válido"
        });
    }

    req.idNinoCarnet = idNino;
    next();
}

// ==========================================
// CONSULTAR CARNET EN JSON
// ==========================================
router.get(
    "/:id",
    requiereRol("administrador", "medico", "enfermero"),
    validarId,
    async (req, res) => {
    try {
        const datos = await consultarCarnet(req.idNinoCarnet);

        if (!datos) {
            return res.status(404).json({
                error: "El niño no se encuentra registrado"
            });
        }

        res.json(datos);

    } catch (error) {
        console.error("ERROR CARNET DIGITAL:", error);

        res.status(500).json({
            error: "Error al consultar el carnet digital"
        });
    }
});

// ==========================================
// DESCARGAR CARNET EN PDF
// ==========================================
router.get(
    "/:id/pdf",
    requiereRol("administrador", "medico", "enfermero"),
    validarId,
    async (req, res) => {
        try {
            const datos = await consultarCarnet(req.idNinoCarnet);

            if (!datos) {
                return res.status(404).json({
                    error: "El niño no se encuentra registrado"
                });
            }

            generarCarnetPDF(res, datos);

        } catch (error) {
            console.error("ERROR PDF CARNET:", error);

            if (!res.headersSent) {
                res.status(500).json({
                    error: "Error al generar el carnet PDF"
                });
            } else {
                res.destroy(error);
            }
        }
    }
);



// ==========================================
// CONSULTAR ESTADO DEL ACCESO DIGITAL
// ==========================================
router.get(
    "/acceso/:id",
    requiereRol("administrador", "medico", "enfermero"),
    validarId,
    async (req, res) => {
        try {
            const resultado = await pool.query(`
                SELECT
                    id_nino,
                    estado,
                    fecha_creacion,
                    fecha_actualizacion
                FROM accesos_carnet
                WHERE id_nino = $1
            `, [req.idNinoCarnet]);

            res.json({
                acceso: resultado.rows[0] || null
            });

        } catch (error) {
            console.error("ERROR ESTADO CARNET:", error);

            res.status(500).json({
                error: "Error al consultar el acceso"
            });
        }
    }
);

// ==========================================
// ACTIVAR ACCESO Y GENERAR PIN
// ==========================================
router.post(
    "/acceso/:id/activar",
    requiereRol("administrador", "medico", "enfermero"),
    protegerOrigenCarnet,
    validarId,
    async (req, res) => {
        try {
            const existente = await pool.query(`
                SELECT estado
                FROM accesos_carnet
                WHERE id_nino = $1
            `, [req.idNinoCarnet]);

            if (existente.rowCount &&
                existente.rows[0].estado === "activo") {
                return res.status(409).json({
                    error: "El carnet ya tiene acceso activo"
                });
            }

            const pin = generarPIN();
            const token = generarTokenQR();
            const hash = crearHashPIN(pin);

            const resultado = await pool.query(`
                INSERT INTO accesos_carnet (
                    id_nino,
                    token_qr,
                    pin_hash,
                    estado
                )
                VALUES ($1, $2, $3, 'activo')

                ON CONFLICT (id_nino)
                DO UPDATE SET
                    token_qr = EXCLUDED.token_qr,
                    pin_hash = EXCLUDED.pin_hash,
                    estado = 'activo',
                    intentos_fallidos = 0,
                    bloqueado_hasta = NULL,
                    fecha_actualizacion = NOW()

                RETURNING id_nino, estado
            `, [
                req.idNinoCarnet,
                token,
                hash
            ]);

            res.status(201).json({
                mensaje: "Acceso activado correctamente",
                acceso: resultado.rows[0],
                pin
            });

        } catch (error) {
            console.error("ERROR ACTIVAR CARNET:", error);

            res.status(500).json({
                error: "Error al activar el carnet"
            });
        }
    }
);

// ==========================================
// RESTABLECER PIN
// ==========================================
router.post(
    "/acceso/:id/restablecer",
    requiereRol("administrador", "medico", "enfermero"),
    protegerOrigenCarnet,
    validarId,
    async (req, res) => {
        try {
            const pin = generarPIN();
            const hash = crearHashPIN(pin);

            const resultado = await pool.query(`
                UPDATE accesos_carnet
                SET
                    pin_hash = $2,
                    intentos_fallidos = 0,
                    bloqueado_hasta = NULL,
                    fecha_actualizacion = NOW()
                WHERE id_nino = $1
                  AND estado = 'activo'
                RETURNING id_nino
            `, [req.idNinoCarnet, hash]);

            if (!resultado.rowCount) {
                return res.status(404).json({
                    error: "No existe un acceso activo"
                });
            }

            res.json({
                mensaje: "PIN restablecido correctamente",
                pin
            });

        } catch (error) {
            console.error("ERROR RESTABLECER PIN:", error);

            res.status(500).json({
                error: "Error al restablecer el PIN"
            });
        }
    }
);

// ==========================================
// REVOCAR ACCESO
// ==========================================
router.post(
    "/acceso/:id/revocar",
    requiereRol("administrador", "medico", "enfermero"),
    protegerOrigenCarnet,
    validarId,
    async (req, res) => {
        try {
            const resultado = await pool.query(`
                UPDATE accesos_carnet
                SET
                    estado = 'revocado',
                    fecha_actualizacion = NOW()
                WHERE id_nino = $1
                  AND estado = 'activo'
                RETURNING id_nino
            `, [req.idNinoCarnet]);

            if (!resultado.rowCount) {
                return res.status(404).json({
                    error: "No existe un acceso activo"
                });
            }

            res.json({
                mensaje: "Acceso revocado correctamente"
            });

        } catch (error) {
            console.error("ERROR REVOCAR CARNET:", error);

            res.status(500).json({
                error: "Error al revocar el acceso"
            });
        }
    }
);
// ==========================================
// OBTENER QR DEL CARNET ACTIVO
// ==========================================

router.get(
    "/acceso/:id/qr",
    requiereRol("administrador", "medico", "enfermero"),
    validarId,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {
            const resultado = await pool.query(`
                SELECT token_qr
                FROM accesos_carnet
                WHERE id_nino = $1
                  AND estado = 'activo'
            `, [req.idNinoCarnet]);

            if (!resultado.rowCount) {
                return res.status(404).json({
                    error: "El carnet no tiene acceso activo"
                });
            }

            const qr = await generarQR(
                resultado.rows[0].token_qr
            );

            res.json({ qr });

        } catch (error) {
            console.error(
                "ERROR GENERACIÓN QR:",
                error
            );

            res.status(500).json({
                error: "No se pudo generar el QR"
            });
        }
    }
);





module.exports = router;
