
"use strict";

const { Router } = require("express");
const pool = require("../config/db");

const {
    enviarPlantillaPrueba,
    enviarRecordatorioVacuna
} = require("../services/whatsappService");

const {
    generarRecordatorios,
    obtenerCalendarioVacunacion,
    listarRecordatorios
} = require("../services/recordatoriosService");

const router = Router();

// ==========================================
// UTILIDADES
// ==========================================

function idValido(valor) {
    return Number.isSafeInteger(valor) && valor > 0;
}

function normalizarTelefono(valor) {
    let telefono = String(valor || "")
        .replace(/\D/g, "");

    if (/^\d{8}$/.test(telefono)) {
        telefono = "502" + telefono;
    }

    return telefono;
}

function fechaLocal(valor) {
    if (!valor) return "";

    if (valor instanceof Date) {
        const partes = new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "America/Guatemala",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).formatToParts(valor);

        const obtener = tipo =>
            partes.find(p => p.type === tipo)?.value;

        return [
            obtener("year"),
            obtener("month"),
            obtener("day")
        ].join("-");
    }

    return String(valor).substring(0, 10);
}

// ==========================================
// NIÑOS Y RESPONSABLES
// ==========================================

router.get("/ninos-responsables", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                n.id_nino,
                n.nombres AS nombres_nino,
                n.apellidos AS apellidos_nino,
                p.id_padre,
                p.nombres AS nombres_responsable,
                p.apellidos AS apellidos_responsable,
                p.canal_notificacion,
                np.parentesco,
                np.responsable_principal

            FROM public.ninos n

            INNER JOIN public.ninos_padres np
                ON np.id_nino = n.id_nino

            INNER JOIN public.padres p
                ON p.id_padre = np.id_padre

            ORDER BY
                n.apellidos,
                n.nombres,
                np.responsable_principal DESC
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "No se pudieron consultar los niños"
        });
    }
});

// ==========================================
// RESPONSABLES
// ==========================================

router.get("/responsables", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                id_padre,
                nombres,
                apellidos,
                canal_notificacion

            FROM public.padres

            WHERE telefono IS NOT NULL
              AND TRIM(telefono) <> ''

            ORDER BY apellidos, nombres
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "No se pudieron consultar responsables"
        });
    }
});

// ==========================================
// VACUNAS PENDIENTES
// ==========================================

router.get("/vacunas-pendientes/:idNino", async (req, res) => {
    try {
        const idNino = Number(req.params.idNino);

        if (!idValido(idNino)) {
            return res.status(400).json({
                error: "ID del niño no válido"
            });
        }

        const resultado = await pool.query(`
            SELECT
                e.id_esquema,
                v.nombre AS vacuna,
                e.numero_dosis,
                e.edad_recomendada_meses,

                (
                    n.fecha_nacimiento +
                    make_interval(
                        months => e.edad_recomendada_meses
                    )
                )::date AS fecha_recomendada,

                CASE
                    WHEN (
                        n.fecha_nacimiento +
                        make_interval(
                            months => e.edad_recomendada_meses
                        )
                    )::date <= CURRENT_DATE
                    THEN 'pendiente'
                    ELSE 'proxima'
                END AS estado

            FROM public.ninos n

            CROSS JOIN public.esquema_vacunacion e

            INNER JOIN public.vacunas v
                ON v.id_vacuna = e.id_vacuna

            WHERE n.id_nino = $1
              AND v.estado = TRUE

              AND NOT EXISTS (
                  SELECT 1
                  FROM public.registros_vacunacion rv
                  WHERE rv.id_nino = n.id_nino
                    AND rv.id_esquema = e.id_esquema
              )

              AND (
                  n.fecha_nacimiento +
                  make_interval(
                      months => e.edad_recomendada_meses
                  )
              )::date <= CURRENT_DATE + 30

            ORDER BY fecha_recomendada, e.id_esquema
        `, [idNino]);

        res.json(resultado.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "No se pudieron consultar vacunas"
        });
    }
});

// ==========================================
// ENVIAR PRUEBA HELLO_WORLD
// ==========================================

router.post("/enviar-prueba", async (req, res) => {

    let idNotificacion = null;
    let solicitudIniciada = false;

    try {
        const idNino = Number(req.body.id_nino);
        const idPadre = Number(req.body.id_padre);
        const idEsquema = Number(req.body.id_esquema);

        if (
            !idValido(idNino) ||
            !idValido(idPadre) ||
            !idValido(idEsquema)
        ) {
            return res.status(400).json({
                error: "Seleccione niño, responsable y vacuna"
            });
        }

        const relacion = await pool.query(`
    SELECT
        p.telefono,
        p.nombres AS responsable
            FROM public.ninos_padres np
            INNER JOIN public.padres p
                ON p.id_padre = np.id_padre
            WHERE np.id_nino = $1
              AND np.id_padre = $2
            LIMIT 1
        `, [idNino, idPadre]);

        if (!relacion.rowCount) {
            return res.status(400).json({
                error: "Responsable no asociado al niño"
            });
        }

        const vacuna = await pool.query(`
    SELECT
        e.id_esquema,
        v.nombre AS vacuna,
        e.numero_dosis,
        (
            n.fecha_nacimiento +
            make_interval(months => e.edad_recomendada_meses)
        )::date AS fecha_vacunacion
            FROM public.ninos n
            CROSS JOIN public.esquema_vacunacion e
            INNER JOIN public.vacunas v
                ON v.id_vacuna = e.id_vacuna
            WHERE n.id_nino = $1
              AND e.id_esquema = $2
              AND v.estado = TRUE
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.registros_vacunacion rv
                  WHERE rv.id_nino = n.id_nino
                    AND rv.id_esquema = e.id_esquema
              )
              AND (
                  n.fecha_nacimiento +
                  make_interval(
                      months => e.edad_recomendada_meses
                  )
              )::date <= CURRENT_DATE + 30
            LIMIT 1
        `, [idNino, idEsquema]);

        if (!vacuna.rowCount) {
            return res.status(400).json({
                error: "Vacuna no disponible para esta prueba"
            });
        }

        const telefono = normalizarTelefono(
            relacion.rows[0].telefono
        );

        const telefonoPrueba = normalizarTelefono(
            process.env.WHATSAPP_TEST_RECIPIENT
        );

        if (
            !/^502\d{8}$/.test(telefono) ||
            telefono !== telefonoPrueba
        ) {
            return res.status(403).json({
                error: "Destinatario no autorizado para pruebas"
            });
        }

        const duplicado = await pool.query(`
            SELECT id_notificacion
            FROM public.notificaciones_whatsapp
            WHERE id_nino = $1
              AND id_padre = $2
              AND id_esquema = $3
              AND tipo_notificacion = 'prueba_vacunacion'
              AND estado IN (
                  'pendiente',
                  'procesando',
                  'aceptado',
                  'enviado',
                  'entregado',
                  'leido'
              )
            LIMIT 1
        `, [idNino, idPadre, idEsquema]);

        if (duplicado.rowCount) {
            return res.status(409).json({
                error: "Ya existe una prueba para esta combinación"
            });
        }

        const registro = await pool.query(`
            INSERT INTO public.notificaciones_whatsapp (
                id_padre,
                id_nino,
                id_esquema,
                tipo_notificacion,
                plantilla,
                telefono_destino,
                estado
            )
            VALUES (
    $1, $2, $3,
    'prueba_vacunacion',
    'sccvi_recordatorio_vacuna',
    $4,
    'pendiente'
)
            RETURNING id_notificacion
        `, [
            idPadre,
            idNino,
            idEsquema,
            telefono
        ]);

        idNotificacion = registro.rows[0].id_notificacion;

        solicitudIniciada = true;

        const datosVacuna = vacuna.rows[0];

const envio = await enviarRecordatorioVacuna(
    telefono,
    relacion.rows[0].responsable,
    datosVacuna.vacuna,
    datosVacuna.numero_dosis,
    fechaLocal(datosVacuna.fecha_vacunacion)
);

        const idMeta = envio.messages?.[0]?.id || null;

        await pool.query(`
            UPDATE public.notificaciones_whatsapp
            SET estado = 'aceptado',
                id_mensaje_meta = $1,
                fecha_envio = NOW(),
                error_detalle = NULL
            WHERE id_notificacion = $2
        `, [idMeta, idNotificacion]);

        res.json({
            mensaje: "Prueba aceptada por Meta",
            id_notificacion: idNotificacion,
            id_mensaje_meta: idMeta
        });

    } catch (error) {
        console.error("ERROR PRUEBA:", error);

        if (idNotificacion !== null) {
            try {
                await pool.query(`
                    UPDATE public.notificaciones_whatsapp
                    SET estado = $1,
                        error_detalle = $2
                    WHERE id_notificacion = $3
                `, [
                    solicitudIniciada
                        ? "procesando"
                        : "fallido",
                    String(error.message).slice(0, 1000),
                    idNotificacion
                ]);
            } catch (registroError) {
                console.error(registroError);
            }
        }

        res.status(500).json({
            error: "No se completó la prueba. Revise el historial antes de reintentar."
        });
    }
});

// ==========================================
// HISTORIAL WHATSAPP
// ==========================================

router.get("/historial", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                nw.id_notificacion,
                nw.id_nino,
                nw.id_padre,
                nw.id_esquema,

                n.nombres AS nombres_nino,
                n.apellidos AS apellidos_nino,

                p.nombres AS nombres_responsable,
                p.apellidos AS apellidos_responsable,

                v.nombre AS vacuna,
                e.numero_dosis,

                nw.tipo_notificacion,
                nw.estado,
                nw.id_mensaje_meta,
                nw.fecha_envio,
                nw.fecha_creacion

            FROM public.notificaciones_whatsapp nw

            INNER JOIN public.padres p
                ON p.id_padre = nw.id_padre

            LEFT JOIN public.ninos n
                ON n.id_nino = nw.id_nino

            LEFT JOIN public.esquema_vacunacion e
                ON e.id_esquema = nw.id_esquema

            LEFT JOIN public.vacunas v
                ON v.id_vacuna = e.id_vacuna

            ORDER BY
                nw.fecha_creacion DESC,
                nw.id_notificacion DESC

            LIMIT 100
        `);

        res.json(resultado.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "No se pudo consultar el historial"
        });
    }
});


// ==========================================
// CREAR RECORDATORIO MANUAL DE PRUEBA
// ==========================================

router.post("/recordatorios/manual", async (req, res) => {
    try {
        const idNino = Number(req.body.id_nino);
        const idPadre = Number(req.body.id_padre);
        const idEsquema = Number(req.body.id_esquema);
        const fechaVacunacion = req.body.fecha_vacunacion;

        if (
            !idValido(idNino) ||
            !idValido(idPadre) ||
            !idValido(idEsquema)
        ) {
            return res.status(400).json({
                error: "Seleccione niño, responsable y vacuna"
            });
        }

        if (
            typeof fechaVacunacion !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(fechaVacunacion)
        ) {
            return res.status(400).json({
                error: "Ingrese una fecha válida en formato YYYY-MM-DD"
            });
        }

        const resultado = await pool.query(`
            WITH candidato AS (
                SELECT
                    n.id_nino,
                    p.id_padre,
                    e.id_esquema,
                    $4::date AS fecha_vacunacion

                FROM public.ninos n

                INNER JOIN public.ninos_padres np
                    ON np.id_nino = n.id_nino

                INNER JOIN public.padres p
                    ON p.id_padre = np.id_padre

                CROSS JOIN public.esquema_vacunacion e

                INNER JOIN public.vacunas v
                    ON v.id_vacuna = e.id_vacuna

                WHERE n.id_nino = $1
                  AND p.id_padre = $2
                  AND e.id_esquema = $3
                  AND v.estado = TRUE
                  AND np.responsable_principal = TRUE
                  AND LOWER(TRIM(COALESCE(
                      p.canal_notificacion, ''
                  ))) = 'whatsapp'
                  AND p.telefono IS NOT NULL
                  AND TRIM(p.telefono) <> ''
                  AND $4::date >= CURRENT_DATE
            )

            INSERT INTO public.recordatorios_vacunacion (
                id_nino,
                id_padre,
                id_esquema,
                tipo_recordatorio,
                fecha_vacunacion,
                fecha_programada,
                estado
            )

            SELECT
                id_nino,
                id_padre,
                id_esquema,
                'manual_prueba',
                fecha_vacunacion,
                CURRENT_DATE,
                'pendiente_autorizacion'

            FROM candidato

            ON CONFLICT ON CONSTRAINT
                uq_recordatorio_vacunacion
            DO NOTHING

            RETURNING id_recordatorio
        `, [
            idNino,
            idPadre,
            idEsquema,
            fechaVacunacion
        ]);

        if (!resultado.rowCount) {
            return res.status(409).json({
                error: "No se pudo crear el recordatorio. Verifique el responsable, la vacuna, la fecha o si ya existe uno igual."
            });
        }

        return res.status(201).json({
            mensaje: "Recordatorio manual creado correctamente",
            id_recordatorio: resultado.rows[0].id_recordatorio
        });

    } catch (error) {
        console.error("ERROR RECORDATORIO MANUAL:", error);

        return res.status(500).json({
            error: "No se pudo crear el recordatorio manual"
        });
    }
});


// ==========================================
// GENERAR RECORDATORIOS
// ==========================================

router.post("/recordatorios/generar", async (req, res) => {
    try {
        const resultado = await generarRecordatorios();

        res.json({
            mensaje: "Programación ejecutada correctamente",
            generados: resultado.generados,
            ids: resultado.ids
        });

    } catch (error) {
        console.error("ERROR GENERACIÓN:", error);

        res.status(500).json({
            error: "No se pudieron generar los recordatorios"
        });
    }
});

// ==========================================
// LISTAR RECORDATORIOS
// ==========================================

router.get("/recordatorios", async (req, res) => {
    try {
        const datos = await listarRecordatorios();
        res.json(datos);

    } catch (error) {
        console.error("ERROR LISTADO:", error);

        res.status(500).json({
            error: "No se pudieron consultar los recordatorios"
        });
    }
});

// ==========================================
// AUTORIZAR RECORDATORIO
// ==========================================

router.patch(
    "/recordatorios/:id/autorizar",
    async (req, res) => {

        try {
            const id = Number(req.params.id);

            if (!idValido(id)) {
                return res.status(400).json({
                    error: "ID no válido"
                });
            }

            // La ruta completa debe estar protegida
            // con requiereRol("administrador") en app.js.
            // Se registra la sesión si dispone del ID.
            const idUsuario = Number(
                req.session?.usuario?.id_usuario
            );

            const resultado = await pool.query(`
                UPDATE public.recordatorios_vacunacion r

                SET estado = 'autorizado',
                    autorizado_por = $2,
                    fecha_autorizacion = NOW(),
                    fecha_actualizacion = NOW()

                WHERE r.id_recordatorio = $1
                  AND r.estado = 'pendiente_autorizacion'
                  AND r.fecha_programada <= CURRENT_DATE
                AND r.fecha_vacunacion >= CURRENT_DATE

                  AND EXISTS (
                      SELECT 1
                      FROM public.ninos_padres np
                      WHERE np.id_nino = r.id_nino
                        AND np.id_padre = r.id_padre
                        AND np.responsable_principal = TRUE
                  )

                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.registros_vacunacion rv
                      WHERE rv.id_nino = r.id_nino
                        AND rv.id_esquema = r.id_esquema
                  )

                RETURNING r.id_recordatorio
            `, [
                id,
                idValido(idUsuario) ? idUsuario : null
            ]);

            if (!resultado.rowCount) {
                return res.status(409).json({
                    error: "El recordatorio no está disponible para autorización"
                });
            }

            res.json({
                mensaje: "Recordatorio autorizado",
                id_recordatorio: id
            });

        } catch (error) {
            console.error("ERROR AUTORIZACIÓN:", error);

            res.status(500).json({
                error: "No se pudo autorizar el recordatorio"
            });
        }
    }
);

// ==========================================
// CANCELAR RECORDATORIO
// ==========================================

router.patch(
    "/recordatorios/:id/cancelar",
    async (req, res) => {

        try {
            const id = Number(req.params.id);

            if (!idValido(id)) {
                return res.status(400).json({
                    error: "ID no válido"
                });
            }

            const resultado = await pool.query(`
                UPDATE public.recordatorios_vacunacion
                SET estado = 'cancelado',
                    fecha_actualizacion = NOW()

                WHERE id_recordatorio = $1
                  AND estado IN (
                      'pendiente_autorizacion',
                      'autorizado'
                  )

                RETURNING id_recordatorio
            `, [id]);

            if (!resultado.rowCount) {
                return res.status(409).json({
                    error: "El recordatorio no puede cancelarse en su estado actual"
                });
            }

            res.json({
                mensaje: "Recordatorio cancelado"
            });

        } catch (error) {
            console.error("ERROR CANCELACIÓN:", error);

            res.status(500).json({
                error: "No se pudo cancelar el recordatorio"
            });
        }
    }
);

// ==========================================
// ENVIAR RECORDATORIO AUTORIZADO
// ==========================================

router.post(
    "/recordatorios/:id/enviar",
    async (req, res) => {

        const id = Number(req.params.id);

        if (!idValido(id)) {
            return res.status(400).json({
                error: "ID no válido"
            });
        }

        // BLOQUEO HASTA APROBACIÓN DE META
        if (
            process.env.WHATSAPP_RECORDATORIOS_HABILITADOS
            !== "true"
        ) {
            return res.status(403).json({
                error: "Los envíos reales están deshabilitados hasta aprobar la plantilla"
            });
        }

        if (typeof enviarRecordatorioVacuna !== "function") {
            return res.status(503).json({
                error: "El servicio de plantillas no está configurado"
            });
        }

        let idNotificacion = null;
        let envioIniciado = false;

        try {
            const cliente = await pool.connect();
            let datos;

            try {
                await cliente.query("BEGIN");

                // Bloqueo para evitar dos envíos simultáneos
                const consulta = await cliente.query(`
                    SELECT
                        r.id_recordatorio,
                        r.id_nino,
                        r.id_padre,
                        r.id_esquema,
                        r.fecha_vacunacion,
                        r.tipo_recordatorio,
                        r.estado,

                        p.nombres AS responsable,
                        p.telefono,
                        p.canal_notificacion,

                        v.nombre AS vacuna,
                        e.numero_dosis

                    FROM public.recordatorios_vacunacion r

                    INNER JOIN public.padres p
                        ON p.id_padre = r.id_padre

                    INNER JOIN public.esquema_vacunacion e
                        ON e.id_esquema = r.id_esquema

                    INNER JOIN public.vacunas v
                        ON v.id_vacuna = e.id_vacuna

                    WHERE r.id_recordatorio = $1
                      AND r.estado = 'autorizado'
                      AND r.fecha_programada <= CURRENT_DATE
                    AND r.fecha_vacunacion >= CURRENT_DATE

                      AND LOWER(TRIM(
                          COALESCE(p.canal_notificacion, '')
                      )) = 'whatsapp'

                      AND EXISTS (
                          SELECT 1
                          FROM public.ninos_padres np
                          WHERE np.id_nino = r.id_nino
                            AND np.id_padre = r.id_padre
                            AND np.responsable_principal = TRUE
                      )

                      AND (
    r.tipo_recordatorio = 'manual_prueba'
    OR (
        r.tipo_recordatorio = 'tres_dias_antes'
        AND NOT EXISTS (
            SELECT 1
            FROM public.registros_vacunacion rv
            WHERE rv.id_nino = r.id_nino
              AND rv.id_esquema = r.id_esquema
        )
    )
)

                    FOR UPDATE OF r
                `, [id]);

                if (!consulta.rowCount) {
                    await cliente.query("ROLLBACK");

                    return res.status(409).json({
                        error: "El recordatorio no está autorizado, venció o la dosis ya fue aplicada"
                    });
                }

                datos = consulta.rows[0];

                const telefono = normalizarTelefono(
                    datos.telefono
                );

                if (!/^502\d{8}$/.test(telefono)) {
                    await cliente.query("ROLLBACK");

                    return res.status(400).json({
                        error: "Teléfono no válido"
                    });
                }

                // Durante la prueba, únicamente
                // se permite el número autorizado.
                const telefonoPrueba = normalizarTelefono(
                    process.env.WHATSAPP_TEST_RECIPIENT
                );

                if (
                    !telefonoPrueba ||
                    telefono !== telefonoPrueba
                ) {
                    await cliente.query("ROLLBACK");

                    return res.status(403).json({
                        error: "Destinatario no autorizado para esta etapa de pruebas"
                    });
                }

                const registro = await cliente.query(`
                    INSERT INTO public.notificaciones_whatsapp (
                        id_padre,
                        id_nino,
                        id_esquema,
                        tipo_notificacion,
                        plantilla,
                        telefono_destino,
                        estado
                    )
                    VALUES (
                        $1, $2, $3,
                        'recordatorio_vacunacion',
                        'sccvi_recordatorio_vacuna',
                        $4,
                        'procesando'
                    )
                    RETURNING id_notificacion
                `, [
                    datos.id_padre,
                    datos.id_nino,
                    datos.id_esquema,
                    telefono
                ]);

                idNotificacion =
                    registro.rows[0].id_notificacion;

                await cliente.query(`
                    UPDATE public.recordatorios_vacunacion
                    SET estado = 'procesando',
                        id_notificacion = $1,
                        fecha_actualizacion = NOW()
                    WHERE id_recordatorio = $2
                `, [idNotificacion, id]);

                await cliente.query("COMMIT");

                datos.telefono_destino = telefono;

            } catch (error) {
                try {
                    await cliente.query("ROLLBACK");
                } catch (_) {}

                throw error;

            } finally {
                cliente.release();
            }

            // No se mantiene una transacción
            // abierta durante la solicitud externa.
            envioIniciado = true;

            const respuestaMeta =
                await enviarRecordatorioVacuna(
                    datos.telefono_destino,
                    datos.responsable,
                    datos.vacuna,
                    datos.numero_dosis,
                    fechaLocal(datos.fecha_vacunacion)
                );

            const idMeta =
                respuestaMeta.messages?.[0]?.id || null;

            await pool.query(`
                UPDATE public.notificaciones_whatsapp
                SET estado = 'aceptado',
                    id_mensaje_meta = $1,
                    fecha_envio = NOW(),
                    error_detalle = NULL
                WHERE id_notificacion = $2
            `, [idMeta, idNotificacion]);

            await pool.query(`
                UPDATE public.recordatorios_vacunacion
                SET estado = 'aceptado',
                    fecha_envio = NOW(),
                    error_detalle = NULL,
                    fecha_actualizacion = NOW()
                WHERE id_recordatorio = $1
            `, [id]);

            return res.json({
                mensaje: "Recordatorio aceptado por Meta",
                id_recordatorio: id,
                id_notificacion: idNotificacion,
                id_mensaje_meta: idMeta
            });

        } catch (error) {
            console.error("ERROR ENVÍO RECORDATORIO:", error);

            // Si la llamada externa pudo haberse iniciado,
            // se conserva procesando para revisión manual.
            // No se reintenta automáticamente.
            const estadoError =
                envioIniciado ? "procesando" : "fallido";

            if (idNotificacion !== null) {
                try {
                    await pool.query(`
                        UPDATE public.notificaciones_whatsapp
                        SET estado = $1,
                            error_detalle = $2
                        WHERE id_notificacion = $3
                          AND estado = 'procesando'
                    `, [
                        estadoError,
                        String(error.message).slice(0, 1000),
                        idNotificacion
                    ]);

                    await pool.query(`
                        UPDATE public.recordatorios_vacunacion
                        SET estado = $1,
                            error_detalle = $2,
                            fecha_actualizacion = NOW()
                        WHERE id_recordatorio = $3
                          AND estado = 'procesando'
                    `, [
                        estadoError,
                        String(error.message).slice(0, 1000),
                        id
                    ]);

                } catch (registroError) {
                    console.error(
                        "ERROR ACTUALIZANDO FALLO:",
                        registroError
                    );
                }
            }

            return res.status(500).json({
                error: "No se pudo confirmar el envío. Revise el historial y los registros de Meta antes de reintentar."
            });
        }
    }
);

 // ==========================================
 // CALENDARIO DE VACUNACIÓN
 // ==========================================

router.get("/calendario", async (req, res) => {
    try {
        const calendario =
            await obtenerCalendarioVacunacion();

        res.json(calendario);

    } catch (error) {
        console.error(
            "ERROR CALENDARIO:",
            error
        );

        res.status(500).json({
            error: "No se pudo consultar el calendario de vacunación"
        });
    }
});


module.exports = router;
