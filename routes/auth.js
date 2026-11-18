
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { requiereAutenticacion } = require("../middleware/auth");

const router = express.Router();

// INICIAR SESIÓN
router.post("/login", async (req, res) => {
    const { usuario, contrasena } = req.body;

    if (typeof usuario !== "string" ||
        typeof contrasena !== "string" ||
        !usuario.trim() || !contrasena) {
        return res.status(400).json({
            error: "Ingrese su usuario y contraseña"
        });
    }

    try {
        const resultado = await pool.query(`
            SELECT
                u.id_usuario,
                u.nombres,
                u.apellidos,
                u.usuario,
                u.contrasena_hash,
                u.estado,
                u.version_sesion,
                r.nombre AS rol
            FROM usuarios u
            INNER JOIN roles r ON r.id_rol = u.id_rol
            WHERE LOWER(u.usuario) = LOWER($1)
            LIMIT 1
        `, [usuario.trim()]);

        const cuenta = resultado.rows[0];

        const valida = cuenta && cuenta.estado
            ? await bcrypt.compare(
                contrasena,
                cuenta.contrasena_hash
            )
            : false;

        if (!valida) {
            return res.status(401).json({
                error: "Usuario o contraseña incorrectos"
            });
        }

        // Evitar reutilizar una sesión anterior
        req.session.regenerate(error => {
            if (error) {
                console.error("ERROR SESIÓN:", error);
                return res.status(500).json({
                    error: "No se pudo iniciar sesión"
                });
            }

            req.session.usuario = {
                id_usuario: cuenta.id_usuario,
                nombres: cuenta.nombres,
                apellidos: cuenta.apellidos,
                usuario: cuenta.usuario,
                rol: cuenta.rol,

                version_sesion: cuenta.version_sesion
            };

            req.session.save(error => {
                if (error) {
                    console.error("ERROR GUARDANDO SESIÓN:", error);
                    return res.status(500).json({
                        error: "No se pudo guardar la sesión"
                    });
                }

                res.json({
                    mensaje: "Inicio de sesión correcto",
                    usuario: req.session.usuario
                });
            });
        });

    } catch (error) {
        console.error("ERROR LOGIN:", error);
        res.status(500).json({
            error: "Error al iniciar sesión"
        });
    }
});

// CONSULTAR SESIÓN

 // CONSULTAR SESIÓN
router.get("/sesion", requiereAutenticacion, (req, res) => {
    res.json({
        usuario: req.session.usuario
    });
});


// CERRAR SESIÓN
router.post("/logout", (req, res) => {
    req.session.destroy(error => {
        if (error) {
            return res.status(500).json({
                error: "No se pudo cerrar sesión"
            });
        }

        res.clearCookie("sccvi.sid");
        res.json({
            mensaje: "Sesión cerrada correctamente"
        });
    });
});

module.exports = router;
