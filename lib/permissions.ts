export type PermissionKey =
  | 'taskCreate'
  | 'taskEditStatus'
  | 'taskEditDetails'
  | 'taskEditDates'
  | 'taskAddSubtasks'
  | 'taskEditStructure'
  | 'taskDelete'
  | 'activityCreate'
  | 'activityEditStatus'
  | 'activityDelete';

export type RolePermissionSet = Record<PermissionKey, boolean>;
export type RolePermissionSettings = Record<string, RolePermissionSet>;

export const SYSTEM_ROLE_OPTIONS = [
  { id: 'admin', name: 'Administrador Global' },
  { id: 'org_admin', name: 'Administrador de Organización' },
  { id: 'manager', name: 'Gerente' },
  { id: 'coordinador', name: 'Coordinador' },
  { id: 'administrativo', name: 'Administrativo' },
  { id: 'user', name: 'Usuario' },
] as const;

export const PERMISSION_GROUPS: Array<{
  title: string;
  permissions: Array<{ key: PermissionKey; label: string }>;
}> = [
  {
    title: 'Tareas',
    permissions: [
      { key: 'taskCreate', label: 'Crear tareas' },
      { key: 'taskEditStatus', label: 'Cambiar estado' },
      { key: 'taskEditDetails', label: 'Editar detalles' },
      { key: 'taskEditDates', label: 'Editar fechas' },
      { key: 'taskAddSubtasks', label: 'Crear subtareas' },
      { key: 'taskEditStructure', label: 'Editar workflow' },
      { key: 'taskDelete', label: 'Eliminar tareas' },
    ],
  },
  {
    title: 'Actividades',
    permissions: [
      { key: 'activityCreate', label: 'Crear actividades' },
      { key: 'activityEditStatus', label: 'Cambiar estado' },
      { key: 'activityDelete', label: 'Eliminar actividades' },
    ],
  },
];

const allPermissions = (value: boolean): RolePermissionSet => ({
  taskCreate: value,
  taskEditStatus: value,
  taskEditDetails: value,
  taskEditDates: value,
  taskAddSubtasks: value,
  taskEditStructure: value,
  taskDelete: value,
  activityCreate: value,
  activityEditStatus: value,
  activityDelete: value,
});

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionSettings = {
  admin: allPermissions(true),
  org_admin: allPermissions(true),
  manager: allPermissions(true),
  coordinador: {
    ...allPermissions(true),
    taskEditStructure: false,
  },
  administrativo: {
    ...allPermissions(false),
    taskEditStatus: true,
    activityCreate: true,
    activityEditStatus: true,
  },
  user: {
    ...allPermissions(false),
    taskEditStatus: true,
    activityEditStatus: true,
  },
};

const defaultPermissionsForRole = (role?: string | null): RolePermissionSet => {
  return {
    ...allPermissions(false),
    ...(role ? DEFAULT_ROLE_PERMISSIONS[role] : DEFAULT_ROLE_PERMISSIONS.user),
  };
};

export const normalizeRolePermissions = (value: any): RolePermissionSettings => {
  const source = value?.roles || value?.rolePermissions || value || {};

  return SYSTEM_ROLE_OPTIONS.reduce<RolePermissionSettings>((settings, role) => {
    settings[role.id] = {
      ...defaultPermissionsForRole(role.id),
      ...(source?.[role.id] || {}),
    };
    return settings;
  }, {});
};

export const resolveRolePermissions = (
  settings: RolePermissionSettings | null | undefined,
  role?: string | null
): RolePermissionSet => {
  const roleId = role || 'user';

  return {
    ...defaultPermissionsForRole(roleId),
    ...(settings?.[roleId] || {}),
  };
};
