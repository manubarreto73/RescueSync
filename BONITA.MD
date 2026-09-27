Para integrar la app web con Bonita necesito que me pases:

ACCESO
1. URL base del engine y versión exacta de Bonita.
2. Un usuario técnico (de servicio) para que el backend se autentique, con su
   contraseña. No un usuario humano del proceso.
3. Cómo vamos a autenticarnos: Bonita usa login por /bonita/loginservice, que
   devuelve cookie JSESSIONID + header X-Bonita-API-Token. Confirmame si lo
   exponen así o si hay un proxy en el medio.
4. Si Bonita va a correr en Docker: en qué red y con qué nombre de servicio,
   para que los contenedores se vean entre sí.

PROCESO
5. Nombre y versión exactos del proceso desplegado.
6. El contrato de instanciación: qué variables hay que mandarle al arrancar un
   caso, con nombre exacto, tipo y cuáles son obligatorias.
7. Nombre de las variables de proceso que el flujo lee o escribe durante su
   ejecución (cobertura de lotes, decisión del coordinador, etc.).
8. Nombre de las tareas humanas y a qué actor/rol está mapeada cada una.

TIMER DE LA CONVOCATORIA
9. ¿La duración de la ventana está fija en el diagrama o entra como variable
   de proceso? Necesito que sea variable: el coordinador define la fecha de
   cierre al publicar la convocatoria, así que se la tenemos que pasar nosotros
   al instanciar o al publicar.

LO QUE BONITA NOS VA A PEDIR A NOSOTROS
10. Al vencer el timer, Bonita tiene que hacer un GET a nuestro backend para
    traer las ofertas consolidadas de esa emergencia. Acordemos:
    - la URL exacta del endpoint
    - la forma del JSON que espera el conector
    - cómo se autentica Bonita contra nuestra API (propongo un token de
      servicio fijo en un header, no el JWT de un usuario)
11. Qué otras transiciones nos va a avisar Bonita (cerrar convocatoria,
    finalizar proyecto) y por qué vía.

ORGANIZACIÓN DE BONITA
12. Bonita tiene su propia organización de usuarios, grupos y roles. ¿Van a
    replicar ahí los usuarios de la app, o vamos con un único usuario técnico
    y la app resuelve todo el RBAC por su cuenta? Es una decisión de
    arquitectura y conviene cerrarla ahora, porque condiciona cómo asignamos
    las tareas humanas.
