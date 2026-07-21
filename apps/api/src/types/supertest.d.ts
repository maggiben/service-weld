declare module "supertest" {
  import type { Server } from "http";

  interface Response {
    status: number;
    body: any;
    headers: Record<string, string>;
  }

  interface Test {
    get(url: string): Test;
    post(url: string): Test;
    patch(url: string): Test;
    delete(url: string): Test;
    set(field: string, value: string): Test;
    query(params: Record<string, string | number | boolean | undefined>): Test;
    send(body?: unknown): Test;
    expect(status: number): Test;
    then: Promise<Response>["then"];
    catch: Promise<Response>["catch"];
  }

  interface SuperTest {
    get(url: string): Test;
    post(url: string): Test;
    patch(url: string): Test;
    delete(url: string): Test;
  }

  function request(app: Server): SuperTest;
  export default request;
}
