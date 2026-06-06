import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

export function generateId(): string {
  return uuidv4().replace(/-/g, '');
}

export function generateOrderNo(): string {
  return 'PK' + moment().format('YYYYMMDDHHmmss') + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
}

export function generateCardNo(): string {
  return 'MC' + moment().format('YYYYMMDD') + Math.floor(Math.random() * 100000).toString().padStart(5, '0');
}

export function generateCouponNo(): string {
  return 'CP' + moment().format('YYYYMMDD') + Math.floor(Math.random() * 100000).toString().padStart(5, '0');
}

export function generateInvoiceNo(): string {
  return 'INV' + moment().format('YYYYMMDDHHmmss') + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

export function calculateParkingDuration(entryTime: Date | string, exitTime: Date | string): number {
  const entry = moment(entryTime);
  const exit = moment(exitTime);
  return exit.diff(entry, 'minutes');
}

export function calculateParkingFee(
  durationMinutes: number,
  rule: any
): { originalAmount: number; durationMinutes: number } {
  const freeMinutes = rule.free_minutes || 0;
  const firstHourPrice = rule.first_hour_price || 5;
  const perHourPrice = rule.per_hour_price || 3;
  const dailyMax = rule.daily_max || 0;

  if (durationMinutes <= freeMinutes) {
    return { originalAmount: 0, durationMinutes };
  }

  const chargeableMinutes = durationMinutes - freeMinutes;
  let amount = 0;

  if (chargeableMinutes <= 60) {
    amount = firstHourPrice;
  } else {
    const remainingHours = Math.ceil((chargeableMinutes - 60) / 60);
    amount = firstHourPrice + remainingHours * perHourPrice;
  }

  if (dailyMax > 0 && amount > dailyMax) {
    amount = dailyMax;
  }

  return { originalAmount: Number(amount.toFixed(2)), durationMinutes };
}

export function successResponse(data: any = null, message: string = 'success') {
  return { code: 0, message, data };
}

export function errorResponse(code: number = -1, message: string = 'error', data: any = null) {
  return { code, message, data };
}
