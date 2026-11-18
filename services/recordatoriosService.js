
"use strict";

const pool = require("../config/db");

// ==========================================
// GENERAR RECORDATORIOS A 3 DÍAS
// ==========================================

async function generarRecordatorios() {
    const resultado = await pool.query(`
        WITH candidatos AS (
            SELECT
                n.id_nino,
                p.id_padre,
                e.id_esquema,
                (
                    n.fecha_nacimiento +
                    make_interval(
                        months => e.edad_recomendada_meses
                    )
                )::date AS fecha_vacunacion

            FROM public.ninos n

            CROSS JOIN public.esquema_vacunacion e

            INNER JOIN public.vacunas v
                ON v.id_vacuna = e.id_vacuna

            INNER JOIN public.ninos_padres np
                ON np.id_nino = n.id_nino

            INNER JOIN public.padres p
                ON p.id_padre = np.id_padre

            WHERE v.estado = TRUE
              AND np.responsable_principal = TRUE

              AND LOWER(
                  TRIM(COALESCE(
                      p.canal_notificacion, ''
                  ))
              ) = 'whatsapp'

              AND p.telefono IS NOT NULL
              AND TRIM(p.telefono) <> ''

              AND (
                  n.fecha_nacimiento +
                  make_interval(
                      months => e.edad_recomendada_meses
                  )
              )::date = CURRENT_DATE + 3

              AND NOT EXISTS (
                  SELECT 1
                  FROM public.registros_vacunacion rv
                  WHERE rv.id_nino = n.id_nino
                    AND rv.id_esquema = e.id_esquema
              )
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
            'tres_dias_antes',
            fecha_vacunacion,
            fecha_vacunacion - 3,
            'pendiente_autorizacion'

        FROM candidatos

        ON CONFLICT ON CONSTRAINT
            uq_recordatorio_vacunacion
        DO NOTHING

        RETURNING id_recordatorio
    `);

    return {
        generados: resultado.rowCount,
        ids: resultado.rows.map(
            r => r.id_recordatorio
        )
    };
}

// ==========================================
// CALENDARIO DE VACUNACIÓN
// ==========================================

async function obtenerCalendarioVacunacion() {
    const resultado = await pool.query(`
        WITH calendario AS (
            SELECT
                n.id_nino,
                n.nombres AS nombres_nino,
                n.apellidos AS apellidos_nino,

                e.id_esquema,
                v.nombre AS vacuna,
                e.numero_dosis,

                (
                    n.fecha_nacimiento +
                    make_interval(
                        months => e.edad_recomendada_meses
                    )
                )::date AS fecha_vacunacion

            FROM public.ninos n

            CROSS JOIN public.esquema_vacunacion e

            INNER JOIN public.vacunas v
                ON v.id_vacuna = e.id_vacuna

            WHERE v.estado = TRUE

              AND NOT EXISTS (
                  SELECT 1
                  FROM public.registros_vacunacion rv
                  WHERE rv.id_nino = n.id_nino
                    AND rv.id_esquema = e.id_esquema
              )
        )

        SELECT
            c.id_nino,
            c.nombres_nino,
            c.apellidos_nino,
            c.id_esquema,
            c.vacuna,
            c.numero_dosis,

            TO_CHAR(
                c.fecha_vacunacion,
                'YYYY-MM-DD'
            ) AS fecha_vacunacion,

            c.fecha_vacunacion -
                CURRENT_DATE AS dias_restantes,

            CASE
                WHEN c.fecha_vacunacion < CURRENT_DATE
                    THEN 'atrasada'

                WHEN c.fecha_vacunacion = CURRENT_DATE
                    THEN 'hoy'

                WHEN c.fecha_vacunacion <= CURRENT_DATE + 3
                    THEN 'proxima_3_dias'

                ELSE 'programada'
            END AS estado_calendario,

            r.id_recordatorio,
            r.estado AS estado_recordatorio

        FROM calendario c

        LEFT JOIN public.recordatorios_vacunacion r
            ON r.id_nino = c.id_nino
           AND r.id_esquema = c.id_esquema
           AND r.fecha_vacunacion =
               c.fecha_vacunacion
           AND r.tipo_recordatorio =
               'tres_dias_antes'

           AND r.id_padre = (
               SELECT np.id_padre
               FROM public.ninos_padres np
               WHERE np.id_nino = c.id_nino
                 AND np.responsable_principal = TRUE
               ORDER BY np.id_padre
               LIMIT 1
           )

        WHERE c.fecha_vacunacion >= CURRENT_DATE

        ORDER BY
            c.fecha_vacunacion ASC,
            c.id_nino ASC,
            c.id_esquema ASC

        LIMIT 1000
    `);

    return resultado.rows;
}

// ==========================================
// HISTORIAL DE RECORDATORIOS
// ==========================================

async function listarRecordatorios() {
    const resultado = await pool.query(`
        SELECT
            r.id_recordatorio,
            r.id_nino,
            r.id_padre,
            r.id_esquema,
            r.id_notificacion,

            n.nombres AS nombres_nino,
            n.apellidos AS apellidos_nino,

            p.nombres AS nombres_responsable,
            p.apellidos AS apellidos_responsable,

            v.nombre AS vacuna,
            e.numero_dosis,

            TO_CHAR(
                r.fecha_vacunacion,
                'YYYY-MM-DD'
            ) AS fecha_vacunacion,

            TO_CHAR(
                r.fecha_programada,
                'YYYY-MM-DD'
            ) AS fecha_programada,

            r.estado,
            r.autorizado_por,
            r.fecha_autorizacion,
            r.fecha_envio,
            r.error_detalle,
            r.fecha_creacion

        FROM public.recordatorios_vacunacion r

        INNER JOIN public.ninos n
            ON n.id_nino = r.id_nino

        INNER JOIN public.padres p
            ON p.id_padre = r.id_padre

        INNER JOIN public.esquema_vacunacion e
            ON e.id_esquema = r.id_esquema

        INNER JOIN public.vacunas v
            ON v.id_vacuna = e.id_vacuna

        ORDER BY
            r.fecha_creacion DESC,
            r.id_recordatorio DESC

        LIMIT 300
    `);

    return resultado.rows;
}

module.exports = {
    generarRecordatorios,
    obtenerCalendarioVacunacion,
    listarRecordatorios
};

