
const pool = require("../config/db");

// ==========================================
// VALIDAR SESIÓN CONTRA POSTGRESQL
// ==========================================

async function requiereAutenticacion(req, res, next) {

    const usuarioSesion = req.session?.usuario;

    function rechazarSesion() {
        if (req.originalUrl.startsWith("/api/")) {
            return res.status(401).json({
                error: "Debe iniciar sesión"
            });
        }

        return res.redirect("/login");
    }

    if (!usuarioSesion) {
        return rechazarSesion();
    }

    try {
        const resultado = await pool.query(`
            SELECT
                id_usuario,
                version_sesion,
                estado
            FROM public.usuarios
            WHERE id_usuario = $1
            LIMIT 1
        `, [usuarioSesion.id_usuario]);

        const usuarioBD = resultado.rows[0];

        // Usuario eliminado o desactivado
        if (!usuarioBD || !usuarioBD.estado) {
            return req.session.destroy(error => {
                if (error) {
                    console.error("ERROR DESTRUYENDO SESIÓN:", error);
                }

                res.clearCookie("sccvi.sid");
                return rechazarSesion();
            });
        }

        // Contraseña cambiada o sesión antigua
        if (
            usuarioBD.version_sesion !==
            usuarioSesion.version_sesion
        ) {
            return req.session.destroy(error => {
                if (error) {
                    console.error("ERROR INVALIDANDO SESIÓN:", error);
                }

                res.clearCookie("sccvi.sid");
                return rechazarSesion();
            });
        }

        // Sesión válida
        return next();

    } catch (error) {
        console.error("ERROR VALIDANDO SESIÓN:", error);

        return res.status(503).json({
            error: "No se pudo validar la sesión. Intente nuevamente."
        });
    }
}

// ==========================================
// VALIDAR PERMISOS POR ROL
// ==========================================

function requiereRol(...rolesPermitidos) {

    return (req, res, next) => {

        if (!req.session?.usuario) {
            return res.status(401).json({
                error: "Debe iniciar sesión"
            });
        }

        if (
            !rolesPermitidos.includes(
                req.session.usuario.rol
            )
        ) {
            return res.status(403).json({
                error: "No tiene permisos para esta operación"
            });
        }

        return next();
    };
}

module.exports = {
    requiereAutenticacion,
    requiereRol
};
