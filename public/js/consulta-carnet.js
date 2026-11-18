
document.addEventListener("DOMContentLoaded", () => {

    const formulario =
        document.getElementById("formVerificarPIN");

    const pinInput =
        document.getElementById("pinCarnet");

    const boton =
        document.getElementById("btnVerificarPIN");

    const mensaje =
        document.getElementById("mensajeConsulta");

    const seccionPIN =
        document.getElementById("seccionPIN");

    const seccionCarnet =
        document.getElementById("seccionCarnet");

    const token = window.location.pathname
        .split("/")
        .filter(Boolean)
        .pop();

    function mostrarError(texto) {
        mensaje.textContent = texto;
        mensaje.classList.remove("d-none");
    }

    function limpiarError() {
        mensaje.textContent = "";
        mensaje.classList.add("d-none");
    }

    function formatoFecha(fecha) {
        if (!fecha) return "No registrada";

        const valor = String(fecha).slice(0, 10);
        const partes = valor.split("-");

        if (partes.length !== 3) {
            return "No registrada";
        }

        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    function agregarFila(tabla, valores) {
        const fila = document.createElement("tr");

        valores.forEach(valor => {
            const celda = document.createElement("td");
            celda.textContent = valor ?? "--";
            fila.appendChild(celda);
        });

        tabla.appendChild(fila);
    }

    function mostrarSinDatos(tabla, columnas) {
        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = columnas;
        celda.className = "text-center text-muted";
        celda.textContent =
            "No hay registros disponibles.";

        fila.appendChild(celda);
        tabla.appendChild(fila);
    }

    async function solicitarAPI(url, opciones = {}) {

        const respuesta = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...opciones
        });

        const datos = await respuesta.json()
            .catch(() => ({}));

        if (!respuesta.ok) {
            throw new Error(
                datos.error || "No se pudo completar la consulta"
            );
        }

        return datos;
    }

    function mostrarCarnet(datos) {

        const nino = datos.nino;
        const vacunas = datos.vacunacion || [];
        const crecimiento = datos.crecimiento || [];

        document.getElementById("consultaNombre")
            .textContent =
                `${nino.nombres} ${nino.apellidos}`;

        document.getElementById("consultaNacimiento")
            .textContent =
                formatoFecha(nino.fecha_nacimiento);

        document.getElementById("consultaSexo")
            .textContent =
                nino.sexo === "M"
                    ? "Masculino"
                    : nino.sexo === "F"
                        ? "Femenino"
                        : "No especificado";

        const tablaVacunas =
            document.getElementById("tablaVacunasConsulta");

        tablaVacunas.innerHTML = "";

        if (!vacunas.length) {
            mostrarSinDatos(tablaVacunas, 4);
        } else {
            vacunas.forEach(vacuna => {
                agregarFila(tablaVacunas, [
                    vacuna.vacuna,
                    vacuna.numero_dosis,
                    formatoFecha(vacuna.fecha_aplicacion),
                    formatoFecha(vacuna.proxima_dosis)
                ]);
            });
        }

        const tablaCrecimiento =
            document.getElementById("tablaCrecimientoConsulta");

        tablaCrecimiento.innerHTML = "";

        if (!crecimiento.length) {
            mostrarSinDatos(tablaCrecimiento, 4);
        } else {
            crecimiento.forEach(registro => {
                agregarFila(tablaCrecimiento, [
                    formatoFecha(registro.fecha_medicion),
                    registro.peso_kg,
                    registro.talla_cm,
                    registro.observaciones || "Sin observaciones"
                ]);
            });
        }

        seccionPIN.classList.add("d-none");
        seccionCarnet.classList.remove("d-none");
    }

    formulario.addEventListener("submit", async (evento) => {

        evento.preventDefault();
        limpiarError();

        const pin = pinInput.value.trim();

        if (!/^\d{6}$/.test(pin)) {
            mostrarError(
                "Ingrese un PIN válido de seis dígitos."
            );
            return;
        }

        boton.disabled = true;
        seccionCarnet.classList.add("d-none");

        try {

            await solicitarAPI(
                `/api/carnet-publico/${encodeURIComponent(token)}/verificar`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ pin })
                }
            );

            // No conservar el PIN en el formulario.
            pinInput.value = "";

            const datos = await solicitarAPI(
                `/api/carnet-publico/${encodeURIComponent(token)}/informacion`
            );

            mostrarCarnet(datos);

        } catch (error) {
            pinInput.value = "";
            mostrarError(error.message);
        } finally {
            boton.disabled = false;
        }
    });

});
