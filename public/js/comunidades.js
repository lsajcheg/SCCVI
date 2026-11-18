
const API = "/api/comunidades";

const formulario = document.getElementById("formComunidad");
const tabla = document.getElementById("tablaComunidades");
const mensaje = document.getElementById("mensaje");

let comunidades = [];


let esAdministrador = false;

// Consultar permisos del usuario conectado
async function verificarPermisos() {
    const respuesta = await fetch("/api/auth/sesion", {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (!respuesta.ok) {
        throw new Error("No se pudo verificar la sesión");
    }

    const datos = await respuesta.json();

    esAdministrador =
        datos.usuario.rol === "administrador";

    // Ocultar formulario a usuarios de consulta
    if (!esAdministrador) {
        formulario.style.display = "none";
    }
}


function mostrarMensaje(texto, tipo = "success") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function limpiarFormulario() {
    formulario.reset();
    document.getElementById("id_comunidad").value = "";
}

async function cargarComunidades() {
    try {
        const respuesta = await fetch(API);

        if (!respuesta.ok) {
            throw new Error("No se pudieron cargar las comunidades");
        }

        comunidades = await respuesta.json();
        tabla.replaceChildren();

        comunidades.forEach(comunidad => {
            const fila = document.createElement("tr");

            const valores = [
                comunidad.id_comunidad,
                comunidad.nombre,
                comunidad.ubicacion ?? "",
                comunidad.numero_familias ?? ""
            ];

            valores.forEach(valor => {
                const celda = document.createElement("td");
                celda.textContent = valor;
                fila.appendChild(celda);
            });

          /* const acciones = document.createElement("td");

            const editar = document.createElement("button");
            editar.textContent = "Editar";
            editar.className = "btn btn-warning btn-sm me-2";
            editar.onclick = () => editarComunidad(comunidad.id_comunidad);

            const eliminar = document.createElement("button");
            eliminar.textContent = "Eliminar";
            eliminar.className = "btn btn-danger btn-sm";
            eliminar.onclick = () => eliminarComunidad(comunidad.id_comunidad);

            acciones.append(editar, eliminar);
            fila.appendChild(acciones);
            tabla.appendChild(fila);
        });*/

        
const acciones = document.createElement("td");

// Verificar si el usuario es administrador
if (esAdministrador) {

    const editar = document.createElement("button");
    editar.textContent = "Editar";
    editar.className = "btn btn-warning btn-sm me-2";
    editar.onclick = () =>
        editarComunidad(comunidad.id_comunidad);

    const eliminar = document.createElement("button");
    eliminar.textContent = "Eliminar";
    eliminar.className = "btn btn-danger btn-sm";
    eliminar.onclick = () =>
        eliminarComunidad(comunidad.id_comunidad);

    acciones.append(editar, eliminar);

} else {
    // Médico, enfermero y encargado
    acciones.textContent = "Solo consulta";
}

fila.appendChild(acciones);
tabla.appendChild(fila);

});




    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const id = document.getElementById("id_comunidad").value;

    const datos = {
        nombre: document.getElementById("nombre").value.trim(),
        ubicacion: document.getElementById("ubicacion").value.trim(),
        numero_familias: document.getElementById("numero_familias").value
    };

    try {
        const respuesta = await fetch(
            id ? `${API}/${id}` : API,
            {
                method: id ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(datos)
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.error || "Error al guardar");
        }

        limpiarFormulario();
        mostrarMensaje("Comunidad guardada correctamente");
        await cargarComunidades();

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
});

function editarComunidad(id) {
    const comunidad = comunidades.find(c => c.id_comunidad === id);
    if (!comunidad) return;

    document.getElementById("id_comunidad").value = comunidad.id_comunidad;
    document.getElementById("nombre").value = comunidad.nombre;
    document.getElementById("ubicacion").value = comunidad.ubicacion ?? "";
    document.getElementById("numero_familias").value =
        comunidad.numero_familias ?? "";

    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function eliminarComunidad(id) {
    if (!confirm("¿Deseas eliminar esta comunidad?")) return;

    try {
        const respuesta = await fetch(`${API}/${id}`, {
            method: "DELETE"
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.error || "Error al eliminar");
        }

        mostrarMensaje(resultado.mensaje);
        await cargarComunidades();

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

//cargarComunidades();

async function iniciarModulo() {
    try {
        await verificarPermisos();
        await cargarComunidades();
    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

iniciarModulo();