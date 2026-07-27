# Licenciamiento cloud para VANTI Suite

Pixel expone dos endpoints REST JSON compatibles con la especificación de VANTI Suite:

## Verificar licencia

`POST /api/v1/license/verify`

```json
{
  "license_key": "VANTI-2026-DEMO",
  "machine_id": "79D940E04B625C27",
  "os": "Windows",
  "timestamp": "2026-07-27T10:49:00.000Z"
}
```

Si la licencia está activa, no está vencida y tiene usos disponibles, Pixel responde `valid: true` con el saldo actual.

## Registrar consumo

`POST /api/v1/license/use`

```json
{
  "license_key": "VANTI-2026-DEMO",
  "machine_id": "79D940E04B625C27",
  "action": "organizar_fotos",
  "items_processed": 150,
  "timestamp": "2026-07-27T10:50:00.000Z"
}
```

Cada consumo exitoso incrementa `used_count` en una unidad y registra una fila en `license_usage_logs` con máquina, acción, cantidad de ítems, sistema operativo e IP.

## Administración en Pixel

La sección `/licenses` queda disponible para administradores globales. Desde allí se pueden:

- crear claves de licencia;
- activar o desactivar licencias;
- definir cliente, plan, vencimiento y usos máximos;
- editar usos consumidos cuando sea necesario;
- consultar el historial de ejecuciones por licencia;
- copiar los endpoints para configurar los scripts.

Las tablas `licenses` y `license_usage_logs` tienen RLS activo y no se exponen directamente a usuarios anónimos ni autenticados. El cliente de escritorio solo se comunica con los endpoints públicos; la administración interna usa rutas protegidas por sesión de administrador global.
