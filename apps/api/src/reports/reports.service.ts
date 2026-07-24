import { Injectable } from "@nestjs/common";
import type {
  CylinderLifeQuery,
  DataQualityQuery,
  FleetQuery,
  FloatAgingQuery,
  LossReportQuery,
  MedicalStatementQuery,
  RefillReportQuery,
  RentalReportQuery,
  SupplierReturnsQuery,
} from "@weld/schemas";
import { ReportsRepository } from "./reports.repository";

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  private envelope<T>(data: T[]) {
    return { data, generated_at: new Date().toISOString() };
  }

  async fleet(query: FleetQuery) {
    const data = await this.repository.fleet(query);
    return this.envelope(data);
  }

  async floatAging(query: FloatAgingQuery) {
    const result = await this.repository.floatAging(query);
    return { ...this.envelope(result.data), page: result.page };
  }

  async rental(query: RentalReportQuery) {
    const data = await this.repository.rental(query);
    return this.envelope(data);
  }

  async refill(query: RefillReportQuery) {
    const data = await this.repository.refill(query);
    return this.envelope(data);
  }

  async loss(query: LossReportQuery) {
    const data = await this.repository.loss(query);
    return this.envelope(data);
  }

  async supplierReturns(query: SupplierReturnsQuery) {
    const result = await this.repository.supplierReturns(query);
    return { ...this.envelope(result.data), page: result.page };
  }

  async cylinderLife(cylinderId: number, query: CylinderLifeQuery) {
    const data = await this.repository.cylinderLife(
      cylinderId,
      query.gte,
      query.lte,
    );
    return this.envelope(data);
  }

  async medicalStatement(query: MedicalStatementQuery) {
    const data = await this.repository.medicalStatement(query);
    return this.envelope(data);
  }

  async dataQuality(query: DataQualityQuery) {
    const result = await this.repository.dataQuality(query);
    return { ...this.envelope(result.data), page: result.page };
  }
}
