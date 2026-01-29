// src/validations/barbershopValidation.ts
import { z } from "zod";

export const AddressSchema = z.object({
  cep: z.string().optional().default(""),
  estado: z.string().optional().default(""),
  cidade: z.string().optional().default(""),
  bairro: z.string().optional().default(""),
  rua: z.string().optional().default(""),
  numero: z.string().optional().default(""),
  complemento: z.string().optional(),
});

export const WorkingHourSchema = z.object({
  day: z.string().min(3),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Formato deve ser HH:mm"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Formato deve ser HH:mm"),
});

const hexColorRegex = /^#([0-9A-Fa-f]{6})$/;

export const BarbershopSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  description: z.string().max(300, "Descrição muito longa").optional().default(""),
  address: AddressSchema.optional(),
  logoUrl: z.string().url("URL inválida").or(z.literal("")).optional(),
  contact: z.string().optional().default(""),
  instagram: z.string().optional(),
  slug: z.string().max(50, "Descrição muito longa"),
  workingHours: z.array(WorkingHourSchema).min(1, "Informe pelo menos um horário de funcionamento"),
  // style
  themeColor: z.string().regex(hexColorRegex, "Cor primária deve ser um código hexadecimal válido (ex: #RRGGBB)").optional().default("#000000"),
  LogoBackgroundColor: z
    .string()
    .regex(hexColorRegex, "Cor primária deve ser um código hexadecimal válido (ex: #RRGGBB)")
    .optional()
    .default("#000000"),
  // checkout
  mercadoPagoAccessToken: z.string().optional().or(z.literal("")),
  mercadoPagoWebhookSecret: z.string().optional().or(z.literal("")),
  paymentsEnabled: z.boolean().optional(),
  requireOnlinePayment: z.boolean().optional(),
  // recorrencia
  loyaltyProgram: z
    .object({
      enabled: z.boolean().optional(),
      targetCount: z.number().min(1, "O alvo deve ser pelo menos 1").optional(),
      rewardDescription: z.string().trim().optional(),
    })
    .optional(),
});

export const BarbershopCreationSchema = BarbershopSchema.extend({
  adminEmail: z.string().email("Email do admin é obrigatório e deve ser válido"),
  adminPassword: z.string().min(6, "A senha do admin deve ter no mínimo 6 caracteres"),
});

export const BarbershopUpdateSchema = BarbershopSchema.partial();

export const TrialSignupSchema = z.object({
  barbershopName: z.string().min(2, "Nome da barbearia é obrigatório"),
  adminEmail: z.string().email("Email inválido"),
  adminPassword: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});
