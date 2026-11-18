
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../config/db");
const { enviarCorreo } = require("../services/emailService");
const { rateLimit } = require("express-rate-limit");

const router = express.Router();


const limitarRecuperacion = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        error: "Demasiadas solicitudes. Intenta nuevamente en 15 minutos."
    }
});

const DURACION_TOKEN = 15 * 60 * 1000;

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

// SOLICITAR RECUPERACIÓN
router.post("/olvide-contrasena", limitarRecuperacion, async (req, res) => {
    const correo = String(req.body?.correo || "")
        .trim()
        .toLowerCase();

    const mensajeGenerico =
        "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";

    if (
        !correo ||
        correo.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
        return res.status(400).json({
            error: "Ingrese un correo electrónico válido"
        });
    }

    try {
        const resultado = await pool.query(`
            SELECT id_usuario, correo
            FROM public.usuarios
            WHERE LOWER(correo) = $1
              AND estado = TRUE
            LIMIT 1
        `, [correo]);

        if (!resultado.rowCount) {
            return res.json({
                mensaje: mensajeGenerico
            });
        }

        const usuario = resultado.rows[0];

        // Limitar solicitudes repetidas por cuenta
        const reciente = await pool.query(`
            SELECT 1
            FROM public.recuperacion_contrasenas
            WHERE id_usuario = $1
              AND fecha_creacion > NOW() - INTERVAL '2 minutes'
            LIMIT 1
        `, [usuario.id_usuario]);

        if (reciente.rowCount) {
            return res.json({
                mensaje: mensajeGenerico
            });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(token);

        const expiracion = new Date(
            Date.now() + DURACION_TOKEN
        );

        const registro = await pool.query(`
            INSERT INTO public.recuperacion_contrasenas (
                id_usuario,
                token_hash,
                fecha_expiracion
            )
            VALUES ($1, $2, $3)
            RETURNING id_recuperacion
        `, [
            usuario.id_usuario,
            tokenHash,
            expiracion
        ]);

        const baseUrl = process.env.APP_BASE_URL;

        if (!baseUrl) {
            throw new Error("Falta APP_BASE_URL");
        }

        const enlace =
            `${baseUrl.replace(/\/$/, "")}/restablecer-contrasena?token=${token}`;

        try {
            await enviarCorreo(
                usuario.correo,
                "SCCVI - Recuperación de contraseña",
                `
                <div style="font-family:Arial,sans-serif">
                    <h2>Recuperación de contraseña - SCCVI</h2>
                    <p>Recibimos una solicitud para restablecer
                    la contraseña de tu cuenta.</p>

                    <p>
                        <a href="${enlace}">
                            Restablecer mi contraseña
                        </a>
                    </p>

                    <p>Este enlace vence en 15 minutos
                    y solo puede utilizarse una vez.</p>

                    <p>Si no solicitaste este cambio,
                    ignora este mensaje.</p>
                </div>
                `
            );
        } catch (error) {
            // Invalidar el token si falla el envío
            await pool.query(`
                UPDATE public.recuperacion_contrasenas
                SET fecha_utilizacion = NOW()
                WHERE id_recuperacion = $1
            `, [registro.rows[0].id_recuperacion]);

            throw error;
        }

        return res.json({
            mensaje: mensajeGenerico
        });

    } catch (error) {
        console.error("ERROR RECUPERACIÓN:", error);

        return res.json({
            mensaje: mensajeGenerico
        });
    }
});

// RESTABLECER CONTRASEÑA
router.post("/restablecer-contrasena", async (req, res) => {
    const { token, contrasena, confirmarContrasena } =
        req.body || {};

    if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token)
    ) {
        return res.status(400).json({
            error: "Enlace de recuperación no válido"
        });
    }

    if (
        typeof contrasena !== "string" ||
        contrasena.length < 8 ||
        Buffer.byteLength(contrasena, "utf8") > 72 ||
        contrasena !== confirmarContrasena
    ) {
        return res.status(400).json({
            error: "Las contraseñas deben coincidir y contener al menos 12 caracteres (máximo 72 bytes)"
        });
    }

    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const resultado = await cliente.query(`
            SELECT id_recuperacion, id_usuario
            FROM public.recuperacion_contrasenas
            WHERE token_hash = $1
              AND fecha_expiracion > NOW()
              AND fecha_utilizacion IS NULL
            FOR UPDATE
        `, [hashToken(token)]);

        if (!resultado.rowCount) {
            await cliente.query("ROLLBACK");

            return res.status(400).json({
                error: "El enlace ha vencido o ya fue utilizado"
            });
        }

        const recuperacion = resultado.rows[0];

        const hash = await bcrypt.hash(contrasena, 8);

        
const actualizacion = await cliente.query(`
    UPDATE public.usuarios
    SET
        contrasena_hash = $1,
        version_sesion = version_sesion + 1
    WHERE id_usuario = $2
      AND estado = TRUE
`, [hash, recuperacion.id_usuario]);


        if (!actualizacion.rowCount) {
            await cliente.query("ROLLBACK");

            return res.status(400).json({
                error: "No se pudo restablecer la contraseña"
            });
        }

        await cliente.query(`
            UPDATE public.recuperacion_contrasenas
            SET fecha_utilizacion = NOW()
            WHERE id_usuario = $1
              AND fecha_utilizacion IS NULL
        `, [recuperacion.id_usuario]);

        await cliente.query("COMMIT");

        return res.json({
            mensaje: "Contraseña actualizada correctamente"
        });

    } catch (error) {
        await cliente.query("ROLLBACK");

        console.error("ERROR RESTABLECIMIENTO:", error);

        return res.status(500).json({
            error: "No se pudo restablecer la contraseña"
        });

    } finally {
        cliente.release();
    }
});

module.exports = router;
