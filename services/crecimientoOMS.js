
"use strict";
const pool = require("../config/db");

// Calculadora LMS para referencias de crecimiento.
// Requiere tablas oficiales OMS previamente cargadas.
// No genera percentiles sin datos de referencia.


function calcularZ(valor, L, M, S) {
    const numeros = [valor, L, M, S].map(Number);

    if (!numeros.every(Number.isFinite)) {
        return null;
    }

    const [x, l, m, s] = numeros;

    if (x <= 0 || m <= 0 || s <= 0) {
        return null;
    }

    // Cálculo LMS convencional.
    const zOriginal = Math.abs(l) < 1e-10
        ? Math.log(x / m) / s
        : (Math.pow(x / m, l) - 1) / (l * s);

    // Dentro del intervalo ±3 se conserva LMS.
    if (zOriginal >= -3 && zOriginal <= 3) {
        return zOriginal;
    }

    // Obtener el valor correspondiente a una
    // puntuación Z determinada mediante LMS.
    function valorParaZ(z) {
        if (Math.abs(l) < 1e-10) {
            return m * Math.exp(s * z);
        }

        const base = 1 + l * s * z;

        if (base <= 0) return null;

        return m * Math.pow(base, 1 / l);
    }

    // Extensión para valores superiores a +3.
    if (zOriginal > 3) {
        const valor2 = valorParaZ(2);
        const valor3 = valorParaZ(3);

        if (valor2 === null || valor3 === null) {
            return null;
        }

        const distancia = valor3 - valor2;

        if (distancia <= 0) return null;

        return 3 + (x - valor3) / distancia;
    }

    // Extensión para valores inferiores a -3.
    const valorMenos2 = valorParaZ(-2);
    const valorMenos3 = valorParaZ(-3);

    if (valorMenos2 === null || valorMenos3 === null) {
        return null;
    }

    const distancia = valorMenos2 - valorMenos3;

    if (distancia <= 0) return null;

    return -3 + (x - valorMenos3) / distancia;
}


// Aproximación de la función de error.
function erf(x) {
    const signo = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1 / (1 + 0.3275911 * x);

    const y = 1 - (
        (((((1.061405429 * t - 1.453152027) * t)
        + 1.421413741) * t - 0.284496736) * t
        + 0.254829592) * t
    ) * Math.exp(-x * x);

    return signo * y;
}

function calcularPercentil(z) {
    if (!Number.isFinite(z)) return null;

    const percentil = 50 * (1 + erf(z / Math.sqrt(2)));

    return Number(
        Math.max(0, Math.min(100, percentil)).toFixed(2)
    );
}

function calcularIMC(pesoKg, tallaCm) {
    const peso = Number(pesoKg);
    const talla = Number(tallaCm);

    if (
        !Number.isFinite(peso) ||
        !Number.isFinite(talla) ||
        peso <= 0 ||
        talla <= 0
    ) {
        return null;
    }

    return Number(
        (peso / Math.pow(talla / 100, 2)).toFixed(2)
    );
}

function calcularIndicador(valor, referencia) {
    if (!referencia) {
        return {
            disponible: false,
            mensaje: "Referencia OMS no disponible"
        };
    }

    const z = calcularZ(
        valor,
        referencia.L,
        referencia.M,
        referencia.S
    );

    if (z === null || !Number.isFinite(z)) {
        return {
            disponible: false,
            mensaje: "No se pudo calcular el indicador"
        };
    }

    return {
        disponible: true,
        z: Number(z.toFixed(2)),
        percentil: calcularPercentil(z)
    };
}

async function obtenerReferenciaOMS(sexo, edadMeses, indicador) {
    const sexoNormalizado = String(sexo).toUpperCase();
    const edad = Number(edadMeses);

    if (!["M", "F"].includes(sexoNormalizado)) {
        return null;
    }

    if (!Number.isInteger(edad) || edad < 61 || edad > 228) {
        return null;
    }

    if (!["imc_edad", "talla_edad"].includes(indicador)) {
    return null;
}

    const resultado = await pool.query(
        `
        SELECT
            l AS "L",
            m AS "M",
            s AS "S"
        FROM referencias_oms
        WHERE sexo = $1
          AND edad_meses = $2
          AND indicador = $3
          AND version_referencia = 'OMS-2007'
        LIMIT 1
        `,
        [sexoNormalizado, edad, indicador]
    );

    return resultado.rows[0] || null;
}

module.exports = {
    calcularZ,
    calcularPercentil,
    calcularIMC,
    calcularIndicador,
    obtenerReferenciaOMS
};
