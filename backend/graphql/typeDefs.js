const typeDefs = `
  type SystemHealth {
    postgres:  String!
    neo4j:     String!
    timestamp: String!
  }

  type User {
    id:         ID!
    email:      String!
    name:       String
    role:       String
    company_id: Int
  }

  type Session {
    id:         ID!
    number:     String
    branch:     String
    type:       String
    status:     String
    date:       String
    info:       String
    data:       String
    created_at: String
    updated_at: String
  }

  type ChatMessage {
    role:      String!
    content:   String!
    timestamp: String!
  }

  type ChatResponse {
    message:      String!
    context_used: [Session!]!
  }

  type Query {
    systemHealth: SystemHealth!

    sessions(
      limit:  Int
      offset: Int
      branch: String
      type:   String
      status: String
    ): [Session!]!

    session(id: ID!): Session

    me: User

    users: [User!]!
  }

  type Mutation {
    chat(
      message:              String!
      conversation_history: [ChatMessageInput]
    ): ChatResponse!

    login(
      email:    String!
      password: String!
    ): String

    createUser(
      email:    String!
      name:     String!
      role:     String!
      password: String!
    ): User!

    deleteUser(id: ID!): Boolean!

    updateUserPassword(
      id:          ID!
      newPassword: String!
    ): Boolean!

    updateUserRole(
      id:   ID!
      role: String!
    ): User!
  }

  input ChatMessageInput {
    role:    String!
    content: String!
  }
`;

module.exports = { typeDefs };
