
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const {
    calcularIMC,
    calcularIndicador,
    obtenerReferenciaOMS
} = require("../services/crecimientoOMS");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

// Proteger todas las rutas del módulo
router.use(requiereAutenticacion);

router.use(requiereAutenticacion);

// VALIDAR MEDICIÓN
function validarMedicion(datos) {
    const { id_nino, fecha_medicion, peso_kg, talla_cm } = datos;

    if (!Number.isSafeInteger(Number(id_nino)) ||
        Number(id_nino) <= 0) {
        return "Seleccione un niño válido";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_medicion || "")) {
        return "Fecha de medición inválida";
    }

    const fecha = new Date(fecha_medicion + "T00:00:00Z");

    if (isNaN(fecha.getTime()) ||
        fecha.toISOString().slice(0, 10) !== fecha_medicion ||
        fecha > new Date()) {
        return "La fecha de medición no es válida";
    }

   if (
    peso_kg === "" ||
    peso_kg == null ||
    !Number.isFinite(Number(peso_kg)) ||
    Number(peso_kg) < 0.01 ||
    Number(peso_kg) > 999.99
) {
    return "El peso en kilogramos no es válido";
}

    // VALIDAR TALLA EN CENTÍMETROS
if (
    talla_cm === "" ||
    talla_cm == null ||
    !Number.isFinite(Number(talla_cm)) ||
    Number(talla_cm) < 30 ||
    Number(talla_cm) > 220
) {
    return "Ingrese la talla en centímetros. Ejemplo: 130 para 1.30 metros";
}
}



// ==========================================
// LISTAR MEDICIONES CON INDICADORES OMS 2007
// ==========================================
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                r.id_registro,
                r.id_nino,
                n.nombres,
                n.apellidos,
                n.fecha_nacimiento,
                n.sexo,
                r.fecha_medicion,
                r.peso_kg,
                r.talla_cm,
                r.observaciones
            FROM registros_crecimiento r
            JOIN ninos n ON r.id_nino = n.id_nino
            ORDER BY r.fecha_medicion DESC, r.id_registro DESC
        `);

        const registros = [];

        for (const registro of resultado.rows) {

            // Calcular edad en meses
            const edadMeses = calcularEdadMeses(
                registro.fecha_nacimiento,
                registro.fecha_medicion
            );

            // Calcular IMC
            const imc = calcularIMC(
                registro.peso_kg,
                registro.talla_cm
            );

            // Resultados iniciales
            let resultadoOMS = {
                disponible: false,
                mensaje: "Referencia OMS no disponible"
            };

            let omsTalla = {
                disponible: false,
                mensaje: "Referencia OMS no disponible"
            };

            // Referencias OMS 2007: 61 a 228 meses
            if (
                edadMeses >= 61 &&
                edadMeses <= 228 &&
                ["M", "F"].includes(registro.sexo)
            ) {

                // ==================================
                // IMC PARA LA EDAD
                // ==================================
                const referenciaIMC = await obtenerReferenciaOMS(
                    registro.sexo,
                    edadMeses,
                    "imc_edad"
                );

                resultadoOMS = calcularIndicador(
                    imc,
                    referenciaIMC
                );

                // ==================================
                // TALLA PARA LA EDAD
                // ==================================
                const referenciaTalla = await obtenerReferenciaOMS(
                    registro.sexo,
                    edadMeses,
                    "talla_edad"
                );

                omsTalla = calcularIndicador(
                    Number(registro.talla_cm),
                    referenciaTalla
                );
            }

            // Construir respuesta
            registros.push({
                ...registro,
                edad_meses: edadMeses,
                imc,
                oms_imc: resultadoOMS,
                oms_talla: omsTalla
            });
        }

        res.json(registros);

    } catch (error) {
        console.error("ERROR CRECIMIENTO OMS:", error);

        res.status(500).json({
            error: "Error al consultar mediciones"
        });
    }
});


// ==========================================
// CURVAS OMS 2007 - IMC PARA LA EDAD
// ==========================================
router.get("/oms/curvas-imc", async (req, res) => {
    try {
        const sexo = String(req.query.sexo || "")
            .trim()
            .toUpperCase();

        if (!["M", "F"].includes(sexo)) {
            return res.status(400).json({
                error: "Sexo inválido. Utilice M o F."
            });
        }

        const resultado = await pool.query(`
            SELECT
                edad_meses,
                l,
                m,
                s
            FROM referencias_oms
            WHERE sexo = $1
              AND indicador = 'imc_edad'
              AND version_referencia = 'OMS-2007'
              AND edad_meses BETWEEN 61 AND 228
            ORDER BY edad_meses ASC
        `, [sexo]);

        function valorParaZ(l, m, s, z) {
            const L = Number(l);
            const M = Number(m);
            const S = Number(s);

            if (![L, M, S].every(Number.isFinite) ||
                M <= 0 || S <= 0) {
                return null;
            }

            if (Math.abs(L) < 1e-10) {
                return M * Math.exp(S * z);
            }

            const base = 1 + L * S * z;

            if (base <= 0) return null;

            return M * Math.pow(base, 1 / L);
        }

        const curvas = resultado.rows.map(r => ({
            edad_meses: Number(r.edad_meses),
            z_menos_3: valorParaZ(r.l, r.m, r.s, -3),
            z_menos_2: valorParaZ(r.l, r.m, r.s, -2),
            z_menos_1: valorParaZ(r.l, r.m, r.s, -1),
            mediana: Number(r.m),
            z_mas_1: valorParaZ(r.l, r.m, r.s, 1),
            z_mas_2: valorParaZ(r.l, r.m, r.s, 2),
            z_mas_3: valorParaZ(r.l, r.m, r.s, 3)
        }));

        res.json({
            indicador: "imc_edad",
            referencia: "OMS-2007",
            sexo,
            curvas
        });

    } catch (error) {
        console.error("ERROR CURVAS OMS:", error);

        res.status(500).json({
            error: "No se pudieron consultar las curvas OMS"
        });
    }
});


// ==========================================
// CURVAS OMS 2007 - TALLA PARA LA EDAD
// ==========================================
router.get("/oms/curvas-talla", async (req, res) => {
    try {
        const sexo = String(req.query.sexo || "")
            .trim()
            .toUpperCase();

        if (!["M", "F"].includes(sexo)) {
            return res.status(400).json({
                error: "Sexo inválido. Utilice M o F."
            });
        }

        const resultado = await pool.query(`
            SELECT edad_meses, l, m, s
            FROM referencias_oms
            WHERE sexo = $1
              AND indicador = 'talla_edad'
              AND version_referencia = 'OMS-2007'
              AND edad_meses BETWEEN 61 AND 228
            ORDER BY edad_meses ASC
        `, [sexo]);

        function valorParaZ(l, m, s, z) {
            const L = Number(l);
            const M = Number(m);
            const S = Number(s);

            if (![L, M, S].every(Number.isFinite) ||
                M <= 0 || S <= 0) {
                return null;
            }

            if (Math.abs(L) < 1e-10) {
                return M * Math.exp(S * z);
            }

            const base = 1 + L * S * z;
            return base > 0
                ? M * Math.pow(base, 1 / L)
                : null;
        }

        const curvas = resultado.rows.map(r => ({
            edad_meses: Number(r.edad_meses),
            z_menos_3: valorParaZ(r.l, r.m, r.s, -3),
            z_menos_2: valorParaZ(r.l, r.m, r.s, -2),
            z_menos_1: valorParaZ(r.l, r.m, r.s, -1),
            mediana: Number(r.m),
            z_mas_1: valorParaZ(r.l, r.m, r.s, 1),
            z_mas_2: valorParaZ(r.l, r.m, r.s, 2),
            z_mas_3: valorParaZ(r.l, r.m, r.s, 3)
        }));

        res.json({
            indicador: "talla_edad",
            referencia: "OMS-2007",
            sexo,
            curvas
        });

    } catch (error) {
        console.error("ERROR CURVAS TALLA OMS:", error);

        res.status(500).json({
            error: "No se pudieron consultar las curvas de talla"
        });
    }
});


 // ==========================================
 // CURVAS OMS 2007 - PESO PARA LA EDAD
 // Rango: 61 a 120 meses
 // ==========================================
 router.get("/oms/curvas-peso", async (req, res) => {
     try {
         const sexo = String(req.query.sexo || "")
             .trim()
             .toUpperCase();

         if (!["M", "F"].includes(sexo)) {
             return res.status(400).json({
                 error: "Sexo inválido. Utilice M o F."
             });
         }

         const resultado = await pool.query(`
             SELECT edad_meses, l, m, s
             FROM referencias_oms
             WHERE sexo = $1
               AND indicador = 'peso_edad'
               AND version_referencia = 'OMS-2007'
               AND edad_meses BETWEEN 61 AND 120
             ORDER BY edad_meses ASC
         `, [sexo]);

         if (resultado.rows.length === 0) {
             return res.status(404).json({
                 error: "No se encontraron referencias OMS de peso"
             });
         }

         function valorParaZ(l, m, s, z) {
             const L = Number(l);
             const M = Number(m);
             const S = Number(s);

             if (
                 ![L, M, S].every(Number.isFinite) ||
                 M <= 0 ||
                 S <= 0
             ) {
                 return null;
             }

             if (Math.abs(L) < 1e-10) {
                 return M * Math.exp(S * z);
             }

             const base = 1 + L * S * z;

             return base > 0
                 ? M * Math.pow(base, 1 / L)
                 : null;
         }

         const curvas = resultado.rows.map(r => ({
             edad_meses: Number(r.edad_meses),
             z_menos_3: valorParaZ(r.l, r.m, r.s, -3),
             z_menos_2: valorParaZ(r.l, r.m, r.s, -2),
             z_menos_1: valorParaZ(r.l, r.m, r.s, -1),
             mediana: Number(r.m),
             z_mas_1: valorParaZ(r.l, r.m, r.s, 1),
             z_mas_2: valorParaZ(r.l, r.m, r.s, 2),
             z_mas_3: valorParaZ(r.l, r.m, r.s, 3)
         }));

         res.json({
             indicador: "peso_edad",
             referencia: "OMS-2007",
             sexo,
             edad_minima_meses: 61,
             edad_maxima_meses: 120,
             curvas
         });

     } catch (error) {
         console.error("ERROR CURVAS PESO OMS:", error);

         res.status(500).json({
             error: "No se pudieron consultar las curvas de peso"
         });
     }
 });





// REGISTRAR MEDICIÓN
//router.post("/", async (req, res) => {
  
    router.post(
    "/",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => {
    const error = validarMedicion(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    try {
        const {
            id_nino, fecha_medicion,
            peso_kg, talla_cm, observaciones
        } = req.body;

        const nino = await pool.query(`
            SELECT fecha_nacimiento
            FROM ninos
            WHERE id_nino = $1
        `, [id_nino]);

        if (!nino.rowCount) {
            return res.status(404).json({
                error: "Niño no encontrado"
            });
        }

        const nacimiento = nino.rows[0].fecha_nacimiento;
        const fechaNacimiento = new Date(nacimiento)
            .toISOString().slice(0, 10);

        if (fecha_medicion < fechaNacimiento) {
            return res.status(400).json({
                error: "La medición no puede ser anterior al nacimiento"
            });
        }
        // VERIFICAR MEDICIÓN DUPLICADA
const duplicado = await pool.query(`
    SELECT id_registro
    FROM registros_crecimiento
    WHERE id_nino = $1
      AND fecha_medicion = $2
      AND peso_kg = $3
      AND talla_cm = $4
    LIMIT 1
`, [
    id_nino,
    fecha_medicion,
    peso_kg,
    talla_cm
]);

if (duplicado.rowCount > 0) {
    return res.status(409).json({
        error: "Ya existe una medición con la misma fecha, peso y talla para este niño"
    });
}

        const resultado = await pool.query(`
            INSERT INTO registros_crecimiento
                (id_nino, fecha_medicion, peso_kg,
                 talla_cm, observaciones)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [
            id_nino, fecha_medicion,
            peso_kg, talla_cm, observaciones || null
        ]);

        res.status(201).json({
            mensaje: "Medición registrada correctamente",
            registro: resultado.rows[0]
        });

    } catch (error) {
        manejarError(error, res);
    }
});

// ACTUALIZAR MEDICIÓN
//router.put("/:id", async (req, res) => {
  
  router.put(
    "/:id",
    requiereRol("administrador", "medico", "enfermero"),
    async (req, res) => {
    const error = validarMedicion(req.body);

    if (error) {
        return res.status(400).json({ error });
    }

    try {
        const {
            id_nino, fecha_medicion,
            peso_kg, talla_cm, observaciones
        } = req.body;

        const nino = await pool.query(
            "SELECT fecha_nacimiento FROM ninos WHERE id_nino = $1",
            [id_nino]
        );

        if (!nino.rowCount) {
            return res.status(404).json({
                error: "Niño no encontrado"
            });
        }

        const nacimiento = new Date(nino.rows[0].fecha_nacimiento)
            .toISOString().slice(0, 10);

        if (fecha_medicion < nacimiento) {
            return res.status(400).json({
                error: "La medición no puede ser anterior al nacimiento"
            });
        }

        const resultado = await pool.query(`
            UPDATE registros_crecimiento
            SET id_nino = $1,
                fecha_medicion = $2,
                peso_kg = $3,
                talla_cm = $4,
                observaciones = $5
            WHERE id_registro = $6
            RETURNING *
        `, [
            id_nino, fecha_medicion,
            peso_kg, talla_cm, observaciones || null,
            req.params.id
        ]);

        if (!resultado.rowCount) {
            return res.status(404).json({
                error: "Medición no encontrada"
            });
        }

        res.json({
            mensaje: "Medición actualizada correctamente"
        });

    } catch (error) {
        manejarError(error, res);
    }
});

// ELIMINAR MEDICIÓN
//router.delete("/:id", async (req, res) => {
  router.delete(
    "/:id",
    requiereRol("administrador"),
    async (req, res) => {

    try {
        const resultado = await pool.query(`
            DELETE FROM registros_crecimiento
            WHERE id_registro = $1
            RETURNING id_registro
        `, [req.params.id]);

        if (!resultado.rowCount) {
            return res.status(404).json({
                error: "Medición no encontrada"
            });
        }

        res.json({
            mensaje: "Medición eliminada correctamente"
        });

    } catch (error) {
        manejarError(error, res);
    }
});

function manejarError(error, res) {
    console.error("ERROR CRECIMIENTO:", error);

    if (["23503", "23514", "22P02", "22003"].includes(error.code)) {
        return res.status(400).json({
            error: "Datos de medición inválidos"
        });
    }

    res.status(500).json({
        error: "Error al procesar la medición"
    });
}

// CALCULAR EDAD EN MESES COMPLETOS
function calcularEdadMeses(fechaNacimiento, fechaMedicion) {
    const nacimiento = new Date(fechaNacimiento);
    const medicion = new Date(fechaMedicion);

    let meses =
        (medicion.getUTCFullYear() - nacimiento.getUTCFullYear()) * 12 +
        (medicion.getUTCMonth() - nacimiento.getUTCMonth());

    if (medicion.getUTCDate() < nacimiento.getUTCDate()) {
        meses--;
    }

    return meses;
}

module.exports = router;
