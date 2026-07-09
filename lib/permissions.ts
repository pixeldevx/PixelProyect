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
  | 'activityDelete'
  | 'documentView'
  | 'documentUpload'
  | 'documentManageAccess'
  | 'documentDelete'
  | 'billingOverview'
  | 'billingManage'
  | 'inventoryProjectView'
  | 'inventoryProjectManage'
  | 'inventoryOverview'
  | 'orgChartView'
  | 'orgChartManage'
  | 'personnelOverview'
  | 'personnelManage'
  | 'personnelBudgetView'
  | 'personnelBudgetManage';

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
  {
    title: 'Documentos',
    permissions: [
      { key: 'documentView', label: 'Ver documentos del proyecto' },
      { key: 'documentUpload', label: 'Subir documentos' },
      { key: 'documentManageAccess', label: 'Gestionar visibilidad de documentos' },
      { key: 'documentDelete', label: 'Eliminar documentos' },
    ],
  },
  {
    title: 'Facturación',
    permissions: [
      { key: 'billingOverview', label: 'Ver facturación global' },
      { key: 'billingManage', label: 'Gestionar facturas y pagos globales' },
    ],
  },
  {
    title: 'Inventario',
    permissions: [
      { key: 'inventoryProjectView', label: 'Ver inventario del proyecto' },
      { key: 'inventoryProjectManage', label: 'Crear y editar activos del proyecto' },
      { key: 'inventoryOverview', label: 'Ver inventario global' },
    ],
  },
  {
    title: 'Talento humano',
    permissions: [
      { key: 'orgChartView', label: 'Ver organigrama del proyecto' },
      { key: 'orgChartManage', label: 'Editar organigrama del proyecto' },
      { key: 'personnelOverview', label: 'Ver panel global de personal' },
      { key: 'personnelManage', label: 'Gestionar personal global' },
      { key: 'personnelBudgetView', label: 'Ver cobertura presupuestal de personal' },
      { key: 'personnelBudgetManage', label: 'Gestionar cobertura presupuestal de personal' },
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
  documentView: value,
  documentUpload: value,
  documentManageAccess: value,
  documentDelete: value,
  billingOverview: value,
  billingManage: value,
  inventoryProjectView: value,
  inventoryProjectManage: value,
  inventoryOverview: value,
  orgChartView: value,
  orgChartManage: value,
  personnelOverview: value,
  personnelManage: value,
  personnelBudgetView: value,
  personnelBudgetManage: value,
});

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionSettings = {
  admin: allPermissions(true),
  org_admin: allPermissions(true),
  manager: allPermissions(true),
  coordinador: {
    ...allPermissions(true),
    taskEditStructure: false,
    billingOverview: false,
    billingManage: false,
    inventoryOverview: false,
    orgChartManage: false,
    personnelManage: false,
    personnelBudgetManage: false,
  },
  administrativo: {
    ...allPermissions(false),
    taskEditStatus: true,
    activityCreate: true,
    activityEditStatus: true,
    documentView: true,
    documentUpload: true,
    billingOverview: true,
    billingManage: true,
  },
  user: {
    ...allPermissions(false),
    taskEditStatus: true,
    activityEditStatus: true,
    documentView: true,
    documentUpload: true,
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
