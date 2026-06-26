declare namespace Resources {
  interface File {
    name: string;
    data: Promise<string | undefined>;
  }

  interface Page {
    url: string;
    data: string;
    links: string[];
  }
}
