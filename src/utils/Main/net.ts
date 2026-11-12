import { net, type ClientRequestConstructorOptions } from "electron";

export const request = (options: ClientRequestConstructorOptions): Promise<Request.Responce> =>
  new Promise((resolve, reject) => {
    const responce: Request.Responce = {
      url: options.url,
      data: "",
    };

    net
      .request(options)
      .on("response", (res) => {
        res.on("error", (error: Error) => reject(error));
        res.on("data", (chunk) => (responce.data += chunk.toString()));
        res.on("end", () => resolve(responce));
      })
      .on("error", (error: Error) => reject(error))
      .end();
  });
