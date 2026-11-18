
const API_NINOS = "/api/ninos";
const API_PADRES = "/api/padres";
const API_COMUNIDADES = "/api/comunidades";

const formulario = document.getElementById("formNino");
const tablaNinos = document.getElementById("tablaNinos");
const tablaResponsables = document.getElementById("tablaResponsables");
const mensaje = document.getElementById("mensaje");

let ninos = [];
let padresDisponibles = [];
let responsables = [];

// ==========================================
// PERMISOS DEL USUARIO
// ==========================================
let rolUsuario = "";
let puedeRegistrar = false;
let puedeEditar = false;
let puedeEliminar = false;

// ==========================================
// MOSTRAR MENSAJES
// ==========================================
function mostrarMensaje(texto, tipo = "success") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

// ==========================================
// VERIFICAR PERMISOS
// ==========================================
async function verificarPermisos() {
    const respuesta = await fetch("/api/auth/sesion", {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (respuesta.status === 401) {
        window.top.location.replace("/login");
        throw new Error("Sesión finalizada");
    }

    if (!respuesta.ok) {
        throw new Error("No se pudo verificar la sesión");
    }

    const datos = await respuesta.json();

    rolUsuario = datos.usuario.rol;

    puedeRegistrar = [
        "administrador",
        "medico",
        "enfermero"
    ].includes(rolUsuario);

    puedeEditar = puedeRegistrar;
    puedeEliminar = rolUsuario === "administrador";

    // El encargado solamente puede consultar.
    if (!puedeRegistrar) {
        formulario.style.display = "none";

        // Ocultar también la tarjeta del formulario,
        // evitando que quede un espacio vacío.
        const tarjeta = formulario.closest(".card");

        if (tarjeta) {
            tarjeta.style.display = "none";
        }
    }
}

// ==========================================
// CREAR CELDAS DE TABLA
// ==========================================
function crearCelda(fila, valor) {
    const celda = document.createElement("td");
    celda.textContent = valor ?? "";
    fila.appendChild(celda);
    return celda;
}

// ==========================================
// CARGAR COMUNIDADES Y PADRES
// ==========================================
async function cargarCatalogos() {
    try {
        const [resComunidades, resPadres] = await Promise.all([
            fetch(API_COMUNIDADES),
            fetch(API_PADRES)
        ]);

        if (!resComunidades.ok || !resPadres.ok) {
            throw new Error("No se pudieron cargar los catálogos");
        }

        const comunidades = await resComunidades.json();
        padresDisponibles = await resPadres.json();

        const selectComunidad =
            document.getElementById("id_comunidad");

        const selectPadre =
            document.getElementById("seleccionarPadre");

        selectComunidad.replaceChildren(
            new Option("Seleccione comunidad", "")
        );

        selectPadre.replaceChildren(
            new Option("Seleccione padre o tutor", "")
        );

        comunidades.forEach(c => {
            selectComunidad.add(
                new Option(c.nombre, c.id_comunidad)
            );
        });

        padresDisponibles.forEach(p => {
            selectPadre.add(
                new Option(
                    `${p.nombres} ${p.apellidos}`,
                    p.id_padre
                )
            );
        });

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// AGREGAR RESPONSABLE
// ==========================================
function agregarResponsable() {
    if (!puedeRegistrar) {
        mostrarMensaje(
            "No tiene permisos para modificar responsables",
            "danger"
        );
        return;
    }

    const id = Number(
        document.getElementById("seleccionarPadre").value
    );

    const parentesco =
        document.getElementById("parentesco").value;

    if (!id) {
        return mostrarMensaje(
            "Seleccione un padre o tutor",
            "warning"
        );
    }

    if (responsables.some(p => p.id_padre === id)) {
        return mostrarMensaje(
            "Este responsable ya fue agregado",
            "warning"
        );
    }

    responsables.push({
        id_padre: id,
        parentesco,
        responsable_principal: responsables.length === 0
    });

    mostrarResponsables();
}

// ==========================================
// MOSTRAR RESPONSABLES
// ==========================================
function mostrarResponsables() {
    tablaResponsables.replaceChildren();

    responsables.forEach((r, indice) => {
        const padre = padresDisponibles.find(
            p => p.id_padre === r.id_padre
        );

        const fila = document.createElement("tr");

        crearCelda(
            fila,
            padre
                ? `${padre.nombres} ${padre.apellidos}`
                : r.id_padre
        );

        crearCelda(fila, r.parentesco);

        const celdaPrincipal = document.createElement("td");
        const radio = document.createElement("input");

        radio.type = "radio";
        radio.name = "responsablePrincipal";
        radio.checked = r.responsable_principal;
        radio.disabled = !puedeEditar;

        radio.onchange = () => {
            if (!puedeEditar) return;

            responsables.forEach((p, i) => {
                p.responsable_principal = i === indice;
            });

            mostrarResponsables();
        };

        celdaPrincipal.appendChild(radio);
        fila.appendChild(celdaPrincipal);

        const acciones = document.createElement("td");

        if (puedeEditar) {
            const quitar = document.createElement("button");

            quitar.type = "button";
            quitar.className = "btn btn-danger btn-sm";
            quitar.textContent = "Quitar";

            quitar.onclick = () => {
                responsables.splice(indice, 1);

                if (
                    responsables.length &&
                    !responsables.some(
                        p => p.responsable_principal
                    )
                ) {
                    responsables[0].responsable_principal = true;
                }

                mostrarResponsables();
            };

            acciones.appendChild(quitar);
        }

        fila.appendChild(acciones);
        tablaResponsables.appendChild(fila);
    });
}

// ==========================================
// LIMPIAR FORMULARIO
// ==========================================
function limpiarFormulario() {
    formulario.reset();
    document.getElementById("id_nino").value = "";
    responsables = [];
    mostrarResponsables();
}

// ==========================================
// CONSULTAR NIÑOS
// ==========================================
async function cargarNinos() {
    try {
        const respuesta = await fetch(API_NINOS);

        if (!respuesta.ok) {
            throw new Error("Error al consultar niños");
        }

        ninos = await respuesta.json();
        tablaNinos.replaceChildren();

        ninos.forEach(n => {
            const fila = document.createElement("tr");

            crearCelda(fila, n.id_nino);
            crearCelda(
                fila,
                `${n.nombres} ${n.apellidos}`
            );

            crearCelda(
                fila,
                n.fecha_nacimiento.slice(0, 10)
            );

            crearCelda(
                fila,
                n.sexo === "M"
                    ? "Masculino"
                    : "Femenino"
            );

            crearCelda(fila, n.comunidad);

            crearCelda(
                fila,
                n.padres.map(p => p.nombre).join(", ")
            );

            // ==================================
            // ACCIONES SEGÚN EL ROL
            // ==================================
            const acciones = document.createElement("td");

            // ADMINISTRADOR, MÉDICO Y ENFERMERO
            if (puedeEditar) {
                const editar =
                    document.createElement("button");

                editar.textContent = "Editar";
                editar.className =
                    "btn btn-warning btn-sm me-2";

                editar.onclick = () =>
                    editarNino(n.id_nino);

                acciones.appendChild(editar);
            }

            // SOLO ADMINISTRADOR
            if (puedeEliminar) {
                const eliminar =
                    document.createElement("button");

                eliminar.textContent = "Eliminar";
                eliminar.className =
                    "btn btn-danger btn-sm";

                eliminar.onclick = () =>
                    eliminarNino(n.id_nino);

                acciones.appendChild(eliminar);
            }

            // ENCARGADO
            if (!puedeEditar && !puedeEliminar) {
                acciones.textContent = "Solo consulta";
            }

            fila.appendChild(acciones);
            tablaNinos.appendChild(fila);
        });

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// REGISTRAR O ACTUALIZAR NIÑO
// ==========================================
formulario.addEventListener("submit", async evento => {
    evento.preventDefault();

    if (!puedeRegistrar) {
        mostrarMensaje(
            "No tiene permisos para registrar o modificar niños",
            "danger"
        );
        return;
    }

    if (responsables.length === 0) {
        return mostrarMensaje(
            "Agregue al menos un padre o tutor",
            "warning"
        );
    }

    const id =
        document.getElementById("id_nino").value;

    const datos = {
        nombres:
            document.getElementById("nombres").value.trim(),

        apellidos:
            document.getElementById("apellidos").value.trim(),

        fecha_nacimiento:
            document.getElementById("fecha_nacimiento").value,

        sexo:
            document.getElementById("sexo").value,

        id_comunidad:
            document.getElementById("id_comunidad").value,

        padres: responsables
    };

    try {
        const respuesta = await fetch(
            id ? `${API_NINOS}/${id}` : API_NINOS,
            {
                method: id ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(datos)
            }
        );

        const resultado = await respuesta.json();

        // ==================================
        // VALIDACIÓN DE NIÑO DUPLICADO
        // ==================================
        if (
            respuesta.status === 409 &&
            resultado.id_nino
        ) {
            mostrarMensaje(
                `El niño ya está registrado con el ID ` +
                `${resultado.id_nino}. ` +
                `No se puede registrar nuevamente. ` +
                `Utilice el botón Editar para asociar otro responsable.`,
                "warning"
            );
            return;
        }

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "Error al guardar"
            );
        }

        limpiarFormulario();

        await cargarNinos();

        mostrarMensaje(
            resultado.mensaje ||
            "Registro guardado correctamente"
        );

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
});

// ==========================================
// EDITAR NIÑO
// ==========================================
function editarNino(id) {
    if (!puedeEditar) {
        mostrarMensaje(
            "No tiene permisos para modificar niños",
            "danger"
        );
        return;
    }

    const n = ninos.find(
        n => n.id_nino === id
    );

    if (!n) return;

    document.getElementById("id_nino").value =
        n.id_nino;

    document.getElementById("nombres").value =
        n.nombres;

    document.getElementById("apellidos").value =
        n.apellidos;

    document.getElementById("fecha_nacimiento").value =
        n.fecha_nacimiento.slice(0, 10);

    document.getElementById("sexo").value =
        n.sexo;

    document.getElementById("id_comunidad").value =
        n.id_comunidad;

    responsables = n.padres.map(p => ({
        id_padre: p.id_padre,
        parentesco: p.parentesco || "Otro",
        responsable_principal:
            p.responsable_principal
    }));

    mostrarResponsables();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ==========================================
// ELIMINAR NIÑO
// ==========================================
async function eliminarNino(id) {
    if (!puedeEliminar) {
        mostrarMensaje(
            "No tiene permisos para eliminar niños",
            "danger"
        );
        return;
    }

    if (!confirm("¿Deseas eliminar este niño?")) {
        return;
    }

    try {
        const respuesta = await fetch(
            `${API_NINOS}/${id}`,
            {
                method: "DELETE"
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "Error al eliminar"
            );
        }

        await cargarNinos();

        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// BOTÓN AGREGAR RESPONSABLE
// ==========================================
document.getElementById("btnAgregarPadre")
    .addEventListener("click", agregarResponsable);

// ==========================================
// INICIAR MÓDULO
// ==========================================
async function iniciar() {
    try {
        // Primero verificar el rol del usuario
        await verificarPermisos();

        // Después cargar los datos
        await cargarCatalogos();
        await cargarNinos();

    } catch (error) {
        console.error("ERROR INICIO NIÑOS:", error);
        mostrarMensaje(error.message, "danger");
    }
}

iniciar();
