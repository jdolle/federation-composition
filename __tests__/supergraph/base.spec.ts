import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../shared/testkit.js";

testVersions((api, version) => {
  test("detect name collisions", () => {
    expect(() => {
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "name") {
              name: String
            }

            type Query {
              user: User
            }
          `,
        },
        {
          name: "foo",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Member @key(fields: "name") {
              name: String
            }

            type Query {
              member: Member
            }
          `,
        },
      ]);
    }, "detected exact same names").toThrowError(
      "A subgraph named foo already exists",
    );

    expect(() => {
      api.composeServices([
        {
          name: "Foo",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "name") {
              name: String
            }

            type Query {
              user: User
            }
          `,
        },
        {
          name: "foo",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Member @key(fields: "name") {
              name: String
            }

            type Query {
              member: Member
            }
          `,
        },
      ]);
    }, "names are almost identical (one starts with a capital letter)").not.toThrow();
  });

  test('suffix "identical" (foo vs Foo) names with a number', () => {
    const result = api.composeServices([
      {
        name: "Foo",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          type User @key(fields: "name") {
            name: String
          }

          type Query {
            user: User
          }
        `,
      },
      {
        name: "foo",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          type Member @key(fields: "name") {
            name: String
          }

          type Query {
            member: Member
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(graphql`
      enum join__Graph {
        FOO_1 @join__graph(name: "Foo", url: "")
        FOO_2 @join__graph(name: "foo", url: "")
      }
    `);
  });

  test("NOT detect url collisions", () => {
    expect(() => {
      api.composeServices([
        {
          name: "foo",
          url: "http://foo.com",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "name") {
              name: String
            }

            type Query {
              user: User
            }
          `,
        },
        {
          name: "bar",
          url: "http://foo.com",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Member @key(fields: "name") {
              name: String
            }

            type Query {
              member: Member
            }
          `,
        },
      ]);
    }, "detected exact same urls").not.toThrow();
  });

  test("executable directive definition is retained in supergraph", () => {
    const result = api.composeServices([
      {
        name: "foo",
        url: "http://foo.com",
        typeDefs: graphql`
        extend schema
          @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

        directive @a(n: Int) on FIELD

        type Query {
          a: Int
        }
      `,
      },
    ]);
    expect(result.supergraphSdl).toContain("directive @a(n: Int)");
  });

  test("executable directive definition is retained if defined identical in all subgraphs", () => {
    const result = api.composeServices([
      {
        name: "a",
        url: "http://a.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            a: Int
          }
      `,
      },
      {
        name: "b",
        url: "http://b.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            b: Int
          }
        `,
      },
    ]);
    expect(result.supergraphSdl).toContain("directive @a(n: Int)");
  });

  test("executable directive definition is omitted if only defined within a single subgraph", () => {
    const result = api.composeServices([
      {
        name: "a",
        url: "http://a.com",
        typeDefs: graphql`
        extend schema
          @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            a: Int
          }
        `,
      },
      {
        name: "b",
        url: "http://b.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          type Query {
            b: Int
          }
        `,
      },
    ]);
    expect(result.supergraphSdl).not.toContain("directive @a(n: Int)");
  });

  test("executable directive only contains locations shared between all subgraphs", () => {
    const result = api.composeServices([
      {
        name: "a",
        url: "http://a.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            a: Int
          }
        `,
      },
      {
        name: "b",
        url: "http://b.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD | FRAGMENT_SPREAD

          type Query {
            b: Int
          }
          `,
      },
    ]);
    expect(result.supergraphSdl).toBeDefined();
    expect(result.supergraphSdl).toContainGraphQL(graphql`
      directive @a(n: Int) on FIELD
    `);
    expect(result.supergraphSdl).not.toContainGraphQL(graphql`
      directive @a(n: Int) on FIELD | FRAGMENT_SPREAD
    `);
  });

  test("executable directive is removed if no locations are shared between all subgraphs", () => {
    const result = api.composeServices([
      {
        name: "a",
        url: "http://a.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            a: Int
          }
        `,
      },
      {
        name: "b",
        url: "http://b.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FRAGMENT_SPREAD

          type Query {
            b: Int
          }
          `,
      },
    ]);

    expect(result.supergraphSdl).toBeDefined();
    expect(result.supergraphSdl).not.toContain("directive @a(n: Int)");
  });

  test("executable directive is only included with executable definition locations", () => {
    const result = api.composeServices([
      {
        name: "a",
        url: "http://a.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD | FIELD_DEFINITION

          type Query {
            a: Int
          }
        `,
      },
      {
        name: "b",
        url: "http://b.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD | FIELD_DEFINITION

          type Query {
            b: Int
          }
          `,
      },
    ]);

    expect(result.supergraphSdl).toBeDefined();
    expect(result.supergraphSdl).toContainGraphQL(graphql`
      directive @a(n: Int) on FIELD
    `);
  });

  if (version !== "v2.0") {
    test("executable directive that is also a compose directive is included with executable definition and schema definition locations", () => {
      const result = api.composeServices([
        {
          name: "a",
          url: "http://a.com",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@composeDirective"])
            @link(url: "https://a.dev/a/v1.0", import: ["@a"])
            @composeDirective(name: "@a")

          directive @a(n: Int) on FIELD | FIELD_DEFINITION

          type Query {
            a: Int
          }
        `,
        },
        {
          name: "b",
          url: "http://b.com",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: [ "@composeDirective"])
            @link(url: "https://a.dev/a/v1.0", import: ["@a"])
            @composeDirective(name: "@a")

          directive @a(n: Int) on FIELD | FIELD_DEFINITION

          type Query {
            b: Int
          }
          `,
        },
      ]);

      expect(result.supergraphSdl).toBeDefined();
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        directive @a(n: Int) on FIELD | FIELD_DEFINITION
      `);
    });

    test("executable directive that is also a compose directive and used within the subgraph schemas is only included with executable definition locations and schema definition locations", () => {
      const result = api.composeServices([
        {
          name: "a",
          url: "http://a.com",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@composeDirective"])
            @link(url: "https://a.dev/a/v1.0", import: ["@a"])
            @composeDirective(name: "@a")

          directive @a(n: Int) on FIELD | FIELD_DEFINITION

          type Query {
            a: Int @a
          }
        `,
        },
        {
          name: "b",
          url: "http://b.com",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: [ "@composeDirective"])
            @link(url: "https://a.dev/a/v1.0", import: ["@a"])
            @composeDirective(name: "@a")

          directive @a(n: Int) on FIELD | FIELD_DEFINITION

          type Query {
            b: Int @a
          }
          `,
        },
      ]);
      expect(result.supergraphSdl).toBeDefined();
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        directive @a(n: Int) on FIELD | FIELD_DEFINITION
      `);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Query @join__type(graph: A) @join__type(graph: B) {
          a: Int @a @join__field(graph: A)
          b: Int @a @join__field(graph: B)
        }
      `);
    });
  }
});
