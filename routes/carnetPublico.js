
const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();

const pool = require("../config/db");

const {
    verificarPIN
} = require("../services/seguridadCarnet");

// ==========================================
// CONFIGURACIÓN DE SEGURIDAD
// ==========================================

const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;
const DURACION_ACCESO_MS = 15 * 60 * 1000;

const REGEX_TOKEN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==========================================
// VALIDAR ORIGEN DE SOLICITUDES POST
// ==========================================

function validarOrigen(req, res, next) {
    const origen = req.get("Origin");

    if (!origen || origen === "null") {
        return res.status(403).json({
            error: "Origen de solicitud no válido"
        });
    }

    const origenConfigurado =
        process.env.PUBLIC_BASE_URL;

    if (!origenConfigurado) {
        return res.status(503).json({
            error: "Origen público no configurado"
        });
    }

    let permitido;

    try {
        permitido = new URL(origenConfigurado).origin;
    } catch {
        return res.status(500).json({
            error: "Configuración de origen inválida"
        });
    }

    if (origen !== permitido) {
        return res.status(403).json({
            error: "Solicitud rechazada por seguridad"
        });
    }

    next();
}

// ==========================================
// VERIFICAR PIN
// ==========================================

router.post(
    "/:token/verificar",
    validarOrigen,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        const { token } = req.params;
        const { pin } = req.body || {};

        if (
            !REGEX_TOKEN.test(token) ||
            typeof pin !== "string" ||
            !/^\d{6}$/.test(pin)
        ) {
            return res.status(400).json({
                error: "Datos de acceso no válidos"
            });
        }

        const cliente = await pool.connect();

        try {
            await cliente.query("BEGIN");

            // Bloqueamos la fila durante la verificación
            // para contabilizar correctamente los intentos.
            const resultado = await cliente.query(`
                SELECT
                    id_nino,
                    pin_hash,
                    estado,
                    intentos_fallidos,
                    bloqueado_hasta
                FROM accesos_carnet
                WHERE token_qr = $1
                FOR UPDATE
            `, [token]);

            if (
                !resultado.rowCount ||
                resultado.rows[0].estado !== "activo"
            ) {
                await cliente.query("COMMIT");

                return res.status(404).json({
                    error: "Acceso no disponible"
                });
            }

            const acceso = resultado.rows[0];

            if (
                acceso.bloqueado_hasta &&
                new Date(acceso.bloqueado_hasta) > new Date()
            ) {
                await cliente.query("COMMIT");

                return res.status(429).json({
                    error:
                        "Acceso temporalmente bloqueado. Intente más tarde."
                });
            }

            const correcto = verificarPIN(
                pin,
                acceso.pin_hash
            );

            if (!correcto) {

                const intentos =
                    acceso.intentos_fallidos + 1;

                const bloquear =
                    intentos >= MAX_INTENTOS;

                await cliente.query(`
                    UPDATE accesos_carnet
                    SET
                        intentos_fallidos = $2,
                        bloqueado_hasta =
                            CASE
                                WHEN $3 THEN
                                    NOW() + INTERVAL '15 minutes'
                                ELSE NULL
                            END
                    WHERE token_qr = $1
                `, [
                    token,
                    bloquear ? 0 : intentos,
                    bloquear
                ]);

                await cliente.query("COMMIT");

                return res.status(
                    bloquear ? 429 : 401
                ).json({
                    error: bloquear
                        ? "Demasiados intentos. Acceso bloqueado durante 15 minutos."
                        : "PIN incorrecto"
                });
            }

            // PIN válido: reiniciar contador.
            await cliente.query(`
                UPDATE accesos_carnet
                SET
                    intentos_fallidos = 0,
                    bloqueado_hasta = NULL
                WHERE token_qr = $1
            `, [token]);

            await cliente.query("COMMIT");

            // Autorizar temporalmente esta sesión.
            // Regenerar la sesión evita reutilizar
            // identificadores anteriores.
            req.session.regenerate(error => {

                if (error) {
                    return res.status(500).json({
                        error:
                            "No se pudo iniciar la consulta segura"
                    });
                }

                req.session.carnetAutorizado = {
                    idNino: acceso.id_nino,
                    token,
                    vence: Date.now() + DURACION_ACCESO_MS
                };

                req.session.save(errorGuardado => {

                    if (errorGuardado) {
                        return res.status(500).json({
                            error:
                                "No se pudo guardar la autorización"
                        });
                    }

                    res.json({
                        mensaje: "PIN verificado correctamente",
                        autorizado: true
                    });
                });
            });

        } catch (error) {

            await cliente.query("ROLLBACK")
                .catch(() => {});

            console.error(
                "ERROR VERIFICACIÓN CARNET:",
                error
            );

            res.status(500).json({
                error: "No se pudo verificar el acceso"
            });

        } finally {
            cliente.release();
        }
    }
);

// ==========================================
// VERIFICAR AUTORIZACIÓN TEMPORAL
// ==========================================

function requiereAccesoCarnet(req, res, next) {

    const acceso = req.session?.carnetAutorizado;

    if (
        !acceso ||
        acceso.token !== req.params.token ||
        !Number.isSafeInteger(acceso.idNino) ||
        Date.now() >= acceso.vence
    ) {
        return res.status(401).json({
            error: "Debe ingresar su PIN para consultar el carnet"
        });
    }

    next();
}

// ==========================================
// CONSULTAR INFORMACIÓN AUTORIZADA
// ==========================================

router.get(
    "/:token/informacion",
    requiereAccesoCarnet,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const acceso = await pool.query(`
                SELECT id_nino
                FROM accesos_carnet
                WHERE token_qr = $1
                  AND id_nino = $2
                  AND estado = 'activo'
            `, [
                req.params.token,
                req.session.carnetAutorizado.idNino
            ]);

            if (!acceso.rowCount) {
                return res.status(403).json({
                    error: "El acceso fue revocado"
                });
            }

            const idNino = acceso.rows[0].id_nino;

            const nino = await pool.query(`
                SELECT
                    nombres,
                    apellidos,
                    fecha_nacimiento,
                    sexo
                FROM ninos
                WHERE id_nino = $1
            `, [idNino]);

            if (!nino.rowCount) {
                return res.status(404).json({
                    error: "Carnet no encontrado"
                });
            }

            const vacunas = await pool.query(`
                SELECT
                    v.nombre AS vacuna,
                    e.numero_dosis,
                    r.fecha_aplicacion,
                    r.proxima_dosis
                FROM registros_vacunacion r
                INNER JOIN esquema_vacunacion e
                    ON e.id_esquema = r.id_esquema
                INNER JOIN vacunas v
                    ON v.id_vacuna = e.id_vacuna
                WHERE r.id_nino = $1
                ORDER BY
                    r.fecha_aplicacion DESC,
                    v.nombre
            `, [idNino]);

            const crecimiento = await pool.query(`
                SELECT
                    fecha_medicion,
                    peso_kg,
                    talla_cm,
                    observaciones
                FROM registros_crecimiento
                WHERE id_nino = $1
                ORDER BY
                    fecha_medicion DESC,
                    id_registro DESC
                LIMIT 5
            `, [idNino]);

            res.json({
                nino: nino.rows[0],
                vacunacion: vacunas.rows,
                crecimiento: crecimiento.rows
            });

        } catch (error) {

            console.error(
                "ERROR CONSULTA CARNET:",
                error
            );

            res.status(500).json({
                error: "No se pudo consultar el carnet"
            });
        }
    }
);

module.exports = router;
