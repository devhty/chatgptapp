import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const shopHtml = readFileSync("public/petbarn-widget.html", "utf8");

// Product catalog - 4 dog food, 4 cat food
const PRODUCTS = [
  {
    id: "dog-1",
    name: "Royal Canin Adult Dog",
    price: 89.99,
    description: "Premium nutrition for adult dogs, supports healthy digestion",
    category: "dog",
    image: "https://placehold.co/200x200/e8d5b7/333?text=🐕+Royal+Canin",
  },
  {
    id: "dog-2",
    name: "Hill's Science Diet Puppy",
    price: 74.99,
    description: "Specially formulated for growing puppies with DHA",
    category: "dog",
    image: "https://placehold.co/200x200/e8d5b7/333?text=🐶+Hills",
  },
  {
    id: "dog-3",
    name: "Blue Buffalo Wilderness",
    price: 64.99,
    description: "High-protein, grain-free recipe with real chicken",
    category: "dog",
    image: "https://placehold.co/200x200/e8d5b7/333?text=🐕+Blue+Buffalo",
  },
  {
    id: "dog-4",
    name: "Purina Pro Plan Sport",
    price: 59.99,
    description: "Advanced nutrition for active dogs, 30% protein",
    category: "dog",
    image: "https://placehold.co/200x200/e8d5b7/333?text=🐕+Purina",
  },
  {
    id: "cat-1",
    name: "Royal Canin Indoor Cat",
    price: 49.99,
    description: "Tailored nutrition for indoor cats, hairball control",
    category: "cat",
    image: "https://placehold.co/200x200/d5e8e8/333?text=🐱+Royal+Canin",
  },
  {
    id: "cat-2",
    name: "Hill's Science Diet Adult",
    price: 44.99,
    description: "Balanced nutrition for adult cats, easy digestion",
    category: "cat",
    image: "https://placehold.co/200x200/d5e8e8/333?text=🐱+Hills",
  },
  {
    id: "cat-3",
    name: "Blue Buffalo Tastefuls",
    price: 39.99,
    description: "Natural cat food with real salmon, no by-products",
    category: "cat",
    image: "https://placehold.co/200x200/d5e8e8/333?text=🐱+Blue+Buffalo",
  },
  {
    id: "cat-4",
    name: "Purina ONE Healthy Kitten",
    price: 34.99,
    description: "DHA for brain and vision development in kittens",
    category: "cat",
    image: "https://placehold.co/200x200/d5e8e8/333?text=🐱+Purina",
  },
];

const CATEGORIES = ["all", "dog", "cat"];

// Cart storage - keyed by cartId
const carts = new Map();

function getCart(cartId) {
  if (!carts.has(cartId)) {
    carts.set(cartId, { items: [] });
  }
  return carts.get(cartId);
}

function calculateCartTotal(cart) {
  return cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getCartItemCount(cart) {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

const replyWithShopState = (cartId, message, category = "all") => {
  const cart = getCart(cartId);
  const filteredProducts =
    category === "all"
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === category);

  return {
    content: message ? [{ type: "text", text: message }] : [],
    structuredContent: {
      products: filteredProducts,
      cart: {
        items: cart.items,
        total: calculateCartTotal(cart),
        itemCount: getCartItemCount(cart),
      },
      categories: CATEGORIES,
      currentCategory: category,
    },
    _meta: {
      "openai/widgetSessionId": cartId,
    },
  };
};

// Input schemas
const openShopSchema = {
  category: z.enum(["all", "dog", "cat"]).optional(),
};

const addToCartSchema = {
  productId: z.string().min(1),
  quantity: z.number().int().min(1).optional(),
};

const removeFromCartSchema = {
  productId: z.string().min(1),
};

const updateQuantitySchema = {
  productId: z.string().min(1),
  quantity: z.number().int().min(0),
};

const checkoutSchema = {};

function createPetbarnServer() {
  const server = new McpServer({ name: "petstores-shop", version: "0.1.0" });

  // Generate a cart ID for this session
  const cartId = randomUUID();

  server.registerResource(
    "petstores-shop",
    "ui://widget/petbarn.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/petbarn.html",
          mimeType: "text/html+skybridge",
          text: shopHtml,
          _meta: { "openai/widgetPrefersBorder": true },
        },
      ],
    })
  );

  server.registerTool(
    "open_shop",
    {
      title: "Open Petstores Shop",
      description:
        "Opens the Petstores pet food shop. Optionally filter by category: 'dog', 'cat', or 'all'.",
      inputSchema: openShopSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/petbarn.html",
        "openai/toolInvocation/invoking": "Opening shop...",
        "openai/toolInvocation/invoked": "Shop ready",
      },
    },
    async (args) => {
      const category = args?.category ?? "all";
      return replyWithShopState(cartId, "Welcome to Petstores! Browse our selection of premium pet food.", category);
    }
  );

  server.registerTool(
    "add_to_cart",
    {
      title: "Add to Cart",
      description: "Adds a product to the shopping cart by product ID.",
      inputSchema: addToCartSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/petbarn.html",
        "openai/toolInvocation/invoking": "Adding to cart...",
        "openai/toolInvocation/invoked": "Added to cart",
      },
    },
    async (args) => {
      const productId = args?.productId;
      const quantity = args?.quantity ?? 1;

      if (!productId) return replyWithShopState(cartId, "Missing product ID.");

      const product = PRODUCTS.find((p) => p.id === productId);
      if (!product) return replyWithShopState(cartId, `Product ${productId} not found.`);

      const cart = getCart(cartId);
      const existingItem = cart.items.find((item) => item.productId === productId);

      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.items.push({
          productId,
          name: product.name,
          price: product.price,
          quantity,
          image: product.image,
        });
      }

      return replyWithShopState(cartId, `Added ${quantity}x ${product.name} to cart.`);
    }
  );

  server.registerTool(
    "remove_from_cart",
    {
      title: "Remove from Cart",
      description: "Removes a product from the shopping cart.",
      inputSchema: removeFromCartSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/petbarn.html",
        "openai/toolInvocation/invoking": "Removing from cart...",
        "openai/toolInvocation/invoked": "Removed from cart",
      },
    },
    async (args) => {
      const productId = args?.productId;
      if (!productId) return replyWithShopState(cartId, "Missing product ID.");

      const cart = getCart(cartId);
      const itemIndex = cart.items.findIndex((item) => item.productId === productId);

      if (itemIndex === -1) {
        return replyWithShopState(cartId, "Item not found in cart.");
      }

      const removedItem = cart.items[itemIndex];
      cart.items.splice(itemIndex, 1);

      return replyWithShopState(cartId, `Removed ${removedItem.name} from cart.`);
    }
  );

  server.registerTool(
    "update_quantity",
    {
      title: "Update Quantity",
      description: "Updates the quantity of a product in the cart. Set to 0 to remove.",
      inputSchema: updateQuantitySchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/petbarn.html",
        "openai/toolInvocation/invoking": "Updating quantity...",
        "openai/toolInvocation/invoked": "Quantity updated",
      },
    },
    async (args) => {
      const productId = args?.productId;
      const quantity = args?.quantity ?? 0;

      if (!productId) return replyWithShopState(cartId, "Missing product ID.");

      const cart = getCart(cartId);
      const item = cart.items.find((item) => item.productId === productId);

      if (!item) {
        return replyWithShopState(cartId, "Item not found in cart.");
      }

      if (quantity <= 0) {
        cart.items = cart.items.filter((i) => i.productId !== productId);
        return replyWithShopState(cartId, `Removed ${item.name} from cart.`);
      }

      item.quantity = quantity;
      return replyWithShopState(cartId, `Updated ${item.name} quantity to ${quantity}.`);
    }
  );

  server.registerTool(
    "checkout",
    {
      title: "Checkout",
      description: "Processes the checkout and places the order.",
      inputSchema: checkoutSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/petbarn.html",
        "openai/toolInvocation/invoking": "Processing order...",
        "openai/toolInvocation/invoked": "Order placed!",
      },
    },
    async () => {
      const cart = getCart(cartId);

      if (cart.items.length === 0) {
        return replyWithShopState(cartId, "Your cart is empty. Add some items before checkout!");
      }

      const total = calculateCartTotal(cart);
      const itemCount = getCartItemCount(cart);
      const orderId = `PB-${Date.now().toString(36).toUpperCase()}`;

      // Clear the cart
      cart.items = [];

      return {
        content: [
          {
            type: "text",
            text: `🎉 Order confirmed! Order ID: ${orderId}. Total: $${total.toFixed(2)} for ${itemCount} item(s). Thank you for shopping at Petstores!`,
          },
        ],
        structuredContent: {
          orderConfirmation: {
            orderId,
            total,
            itemCount,
            status: "confirmed",
          },
          products: PRODUCTS,
          cart: { items: [], total: 0, itemCount: 0 },
          categories: CATEGORIES,
          currentCategory: "all",
        },
        _meta: {
          "openai/widgetSessionId": cartId,
        },
      };
    }
  );

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end("Petstores MCP server");
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createPetbarnServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(
    `Petstores MCP server listening on http://localhost:${port}${MCP_PATH}`
  );
});