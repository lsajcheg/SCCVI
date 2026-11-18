
const { Router } = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");

const {
    requiereAutenticacion,
    requiereRol
} = require("../middleware/auth");

const router = Router();

// Solo administradores
router.use(requiereAutenticacion);
router.use(requiereRol("administrador"));

// LISTAR ROLES
router.get("/roles", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT id_rol, nombre
            FROM roles
            ORDER BY id_rol
        `);

        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al consultar roles"
        });
    }
});

// LISTAR USUARIOS
router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                u.id_usuario,
                u.nombres,
                u.apellidos,
                u.usuario,
                u.correo,
                u.id_rol,
                r.nombre AS rol,
                u.estado
            FROM usuarios u
            INNER JOIN roles r
                ON u.id_rol = r.id_rol
            ORDER BY u.id_usuario DESC
        `);

        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al listar usuarios"
        });
    }
});

// REGISTRAR USUARIO
router.post("/", async (req, res) => {
    try {
        const {
            nombres,
            apellidos,
            usuario,
            correo,
            contrasena,
            id_rol
        } = req.body;

        if (
            !nombres?.trim() ||
            !apellidos?.trim() ||
            !usuario?.trim() ||
            !correo?.trim() ||
            !contrasena ||
            !id_rol
        ) {
            return res.status(400).json({
                error: "Complete todos los campos"
            });
        }

        if (contrasena.length < 8) {
            return res.status(400).json({
                error: "La contraseña debe tener al menos 8 caracteres"
            });
        }

        const rol = await pool.query(
            "SELECT id_rol FROM roles WHERE id_rol = $1",
            [id_rol]
        );

        if (!rol.rowCount) {
            return res.status(400).json({
                error: "El rol seleccionado no existe"
            });
        }

        const hash = await bcrypt.hash(contrasena, 12);

        const resultado = await pool.query(`
            INSERT INTO usuarios
                (nombres, apellidos, usuario,
                 correo, contrasena_hash,
                 id_rol, estado)
            VALUES ($1, $2, $3, $4, $5, $6, true)
            RETURNING id_usuario
        `, [
            nombres.trim(),
            apellidos.trim(),
            usuario.trim(),
            correo.trim(),
            hash,
            id_rol
        ]);

        res.status(201).json({
            mensaje: "Usuario registrado correctamente",
            id_usuario: resultado.rows[0].id_usuario
        });

    } catch (error) {
        console.error(error);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "El nombre de usuario o correo ya está registrado"
            });
        }

        res.status(500).json({
            error: "Error al registrar usuario"
        });
    }
});

// ACTUALIZAR USUARIO
router.put("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Identificador inválido"
            });
        }

        const {
            nombres,
            apellidos,
            usuario,
            correo,
            id_rol,
            contrasena
        } = req.body;

        if (
            !nombres?.trim() ||
            !apellidos?.trim() ||
            !usuario?.trim() ||
            !correo?.trim() ||
            !id_rol
        ) {
            return res.status(400).json({
                error: "Complete los campos obligatorios"
            });
        }

        const rol = await pool.query(
            "SELECT id_rol FROM roles WHERE id_rol = $1",
            [id_rol]
        );

        if (!rol.rowCount) {
            return res.status(400).json({
                error: "El rol seleccionado no existe"
            });
        }

        if (contrasena && contrasena.length < 8) {
            return res.status(400).json({
                error: "La nueva contraseña debe tener al menos 8 caracteres"
            });
        }

        // Evitar que el administrador cambie su propio rol
        if (id === req.session.usuario.id_usuario) {
            const actual = await pool.query(
                "SELECT id_rol FROM usuarios WHERE id_usuario = $1",
                [id]
            );

            if (
                actual.rowCount &&
                Number(actual.rows[0].id_rol) !== Number(id_rol)
            ) {
                return res.status(400).json({
                    error: "No puede modificar su propio rol"
                });
            }
        }

        let resultado;

        if (contrasena) {
            const hash = await bcrypt.hash(contrasena, 12);

            resultado = await pool.query(`
                UPDATE usuarios
                SET nombres = $1,
                    apellidos = $2,
                    usuario = $3,
                    correo = $4,
                    id_rol = $5,
                    contrasena_hash = $6
                WHERE id_usuario = $7
                RETURNING id_usuario
            `, [
                nombres.trim(),
                apellidos.trim(),
                usuario.trim(),
                correo.trim(),
                id_rol,
                hash,
                id
            ]);
        } else {
            resultado = await pool.query(`
                UPDATE usuarios
                SET nombres = $1,
                    apellidos = $2,
                    usuario = $3,
                    correo = $4,
                    id_rol = $5
                WHERE id_usuario = $6
                RETURNING id_usuario
            `, [
                nombres.trim(),
                apellidos.trim(),
                usuario.trim(),
                correo.trim(),
                id_rol,
                id
            ]);
        }

        if (!resultado.rowCount) {
            return res.status(404).json({
                error: "Usuario no encontrado"
            });
        }

        res.json({
            mensaje: "Usuario actualizado correctamente"
        });

    } catch (error) {
        console.error(error);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "El nombre de usuario o correo ya está registrado"
            });
        }

        res.status(500).json({
            error: "Error al actualizar usuario"
        });
    }
});

// ACTIVAR O DESACTIVAR USUARIO
router.patch("/:id/estado", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { estado } = req.body;

        if (
            !Number.isInteger(id) ||
            id <= 0 ||
            typeof estado !== "boolean"
        ) {
            return res.status(400).json({
                error: "Datos inválidos"
            });
        }

        if (
            id === req.session.usuario.id_usuario &&
            estado === false
        ) {
            return res.status(400).json({
                error: "No puede desactivar su propia cuenta"
            });
        }

        const resultado = await pool.query(`
            UPDATE usuarios
            SET estado = $1
            WHERE id_usuario = $2
            RETURNING id_usuario
        `, [estado, id]);

        if (!resultado.rowCount) {
            return res.status(404).json({
                error: "Usuario no encontrado"
            });
        }

        res.json({
            mensaje: estado
                ? "Usuario activado correctamente"
                : "Usuario desactivado correctamente"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al cambiar estado"
        });
    }
});

module.exports = router;
