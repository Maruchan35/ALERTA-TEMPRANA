import React from 'react';
import { CategoriaAlerta, EstadoAlerta, CATEGORIAS_OFICIALES } from '../../types/alert';
import { ShieldCheck, Users, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple';
  size?: 'sm' | 'md';
  className?: string;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  className = '',
  icon,
}) => {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1 font-semibold tracking-wide',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-semibold',
  }[size];

  const variantClasses = {
    neutral: 'bg-slate-100 text-slate-700 border border-slate-300',
    brand: 'bg-blue-50 text-blue-700 border border-blue-200',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
    warning: 'bg-amber-50 text-amber-800 border border-amber-300',
    danger: 'bg-red-50 text-red-700 border border-red-300',
    purple: 'bg-purple-50 text-purple-700 border border-purple-300',
  }[variant];

  return (
    <span
      className={`inline-flex items-center rounded-md select-none ${sizeClasses} ${variantClasses} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};

export const CategoryBadge: React.FC<{ category: CategoriaAlerta; className?: string }> = ({
  category,
  className = '',
}) => {
  const cat = CATEGORIAS_OFICIALES[category] || CATEGORIAS_OFICIALES['otro'];
  const variant = cat.nivel === 4 ? 'danger' : cat.nivel === 3 ? 'warning' : cat.nivel === 2 ? 'brand' : 'neutral';

  return (
    <Badge
      variant={variant}
      className={className}
      icon={<span className="text-xs">{cat.icono || '⚠️'}</span>}
    >
      {cat.nombre_corto}
    </Badge>
  );
};

export const StatusBadge: React.FC<{ status: EstadoAlerta; verifiedBy?: string; className?: string }> = ({
  status,
  verifiedBy,
  className = '',
}) => {
  switch (status) {
    case 'verificada':
      return (
        <Badge
          variant="success"
          size="sm"
          icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
          className={className}
        >
          {verifiedBy ? `Verificada (${verifiedBy})` : 'Oficial Verificada'}
        </Badge>
      );
    case 'corroborada':
      return (
        <Badge
          variant="brand"
          size="sm"
          icon={<Users className="w-3.5 h-3.5 text-blue-600" />}
          className={className}
        >
          Corroborada por Vecinos
        </Badge>
      );
    case 'no_confirmada':
      return (
        <Badge
          variant="warning"
          size="sm"
          icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
          className={className}
        >
          Reporte Ciudadano
        </Badge>
      );
    case 'pendiente':
      return (
        <Badge
          variant="warning"
          size="sm"
          icon={<Clock className="w-3.5 h-3.5 text-amber-700" />}
          className={className}
        >
          En Revisión (CCE)
        </Badge>
      );
    case 'resuelta':
      return (
        <Badge
          variant="neutral"
          size="sm"
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
          className={className}
        >
          Situación Resuelta
        </Badge>
      );
    case 'descartada':
      return (
        <Badge
          variant="neutral"
          size="sm"
          icon={<XCircle className="w-3.5 h-3.5 text-slate-500" />}
          className={className}
        >
          Descartada
        </Badge>
      );
    case 'expirada':
      return (
        <Badge
          variant="neutral"
          size="sm"
          icon={<Clock className="w-3.5 h-3.5 text-slate-400" />}
          className={className}
        >
          Expirada
        </Badge>
      );
    default:
      return <Badge variant="neutral" className={className}>{status}</Badge>;
  }
};

export const LevelBadge: React.FC<{ level: 1 | 2 | 3 | 4; className?: string }> = ({
  level,
  className = '',
}) => {
  switch (level) {
    case 4:
      return <Badge variant="danger" className={className}>Nivel 4 · Crítico</Badge>;
    case 3:
      return <Badge variant="warning" className={className}>Nivel 3 · Alto</Badge>;
    case 2:
      return <Badge variant="brand" className={className}>Nivel 2 · Medio</Badge>;
    case 1:
      return <Badge variant="neutral" className={className}>Nivel 1 · Informativo</Badge>;
  }
};
